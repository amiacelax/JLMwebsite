/**
 * Auto-suggest Lookup Lexicon cards when a worksheet is published to a student.
 */
(function (global) {
  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
  const MAX_ITEMS = 20;
  const SENTENCE_SPLIT = /[。！？\n]+/;

  function hasJapanese(str) {
    return JA_CHAR.test(String(str || ""));
  }

  function repairMojibakeUtf8(str) {
    const value = String(str || "");
    if (!value || hasJapanese(value)) return value;
    if (!/[\u0080-\u00ff]/.test(value)) return value;
    try {
      const bytes = Uint8Array.from([...value].map((ch) => ch.charCodeAt(0) & 0xff));
      const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (hasJapanese(repaired)) return repaired;
    } catch {
      /* keep original */
    }
    return value;
  }

  function normalizeJapaneseInput(str) {
    return repairMojibakeUtf8(String(str || "").trim());
  }

  function pushText(list, str) {
    const value = normalizeJapaneseInput(str);
    if (!value || !hasJapanese(value)) return;
    list.push(value);
  }

  function grammarItemSentence(item) {
    let out = "";
    (item.parts || []).forEach((part) => {
      if (part.type === "text") {
        if (part.ruby?.length) {
          out += part.ruby.map((r) => r.text || r.base || "").join("");
        } else {
          out += part.value || "";
        }
      } else if (part.type === "blank") {
        out += part.answer || part.hint?.dictionary || "";
      }
    });
    return out.trim();
  }

  function starOrderTexts(item) {
    const texts = [];
    if (Array.isArray(item.tokens) && item.tokens.length) {
      pushText(texts, item.tokens.map((t) => t.text).join(""));
      item.tokens.forEach((t) => pushText(texts, t.text));
      return texts;
    }
    pushText(texts, item.prefix);
    pushText(texts, item.suffix);
    (item.pieces || []).forEach((piece) => pushText(texts, piece));
    const joined =
      String(item.prefix || "") + (item.pieces || []).join("") + String(item.suffix || "");
    pushText(texts, joined);
    return texts;
  }

  function extractJapaneseTexts(assignment) {
    const texts = [];
    (assignment?.sections || []).forEach((section) => {
      pushText(texts, section.title);
      pushText(texts, section.instructions);

      (section.items || []).forEach((item) => {
        if (section.mode === "grammar-blank") {
          pushText(texts, grammarItemSentence(item));
          return;
        }

        if (section.mode === "translation") {
          pushText(texts, item.japanese);
          return;
        }

        if (section.mode === "star-order") {
          starOrderTexts(item).forEach((t) => texts.push(t));
          return;
        }

        if (section.mode === "context-blank") {
          pushText(texts, item.topic);
          (item.parts || []).forEach((part) => {
            if (part.type === "text") pushText(texts, part.value);
          });
          return;
        }

        if (section.mode === "audio-listening") {
          (item.parts || []).forEach((part) => {
            if (part.type === "blank") pushText(texts, part.answer);
          });
          pushText(texts, item.japanese);
          return;
        }

        if (section.mode === "video-response") {
          pushText(texts, item.prompt);
          return;
        }

        if (section.mode === "audio-prompt") {
          pushText(texts, item.prompt);
        }
      });
    });
    return texts;
  }

  function mergeSequenceExists(lex, surfaces) {
    const key = surfaces.join("|");
    return (lex.MERGE_RULES?.surfaceSequences || []).some(
      (seq) => seq.surfaces.join("|") === key
    );
  }

  function surfaceCovered(lex, surface, mergeSurfaces) {
    if (lex.CUSTOM?.[surface]) return true;
    if ((lex.getForceUnits?.() || []).includes(surface)) return true;
    if (lex.LEMMA_QUERY?.[surface]) return true;
    if (mergeSurfaces?.length >= 2 && mergeSequenceExists(lex, mergeSurfaces)) return true;
    return false;
  }

  function splitSentences(text) {
    return String(text || "")
      .split(SENTENCE_SPLIT)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function groupUnmergedSingles(units) {
    const groups = [];
    let index = 0;
    while (index < units.length) {
      const unit = units[index];
      if (unit.ruleKind !== "single" || unit.skipped) {
        index += 1;
        continue;
      }

      const group = [unit];
      let next = index + 1;
      while (next < units.length) {
        const candidate = units[next];
        if (candidate.ruleKind !== "single" || candidate.skipped) break;
        if (candidate.start !== group[group.length - 1].end) break;
        group.push(candidate);
        next += 1;
      }

      if (group.length >= 2) {
        groups.push({
          surface: group.map((g) => g.surface).join(""),
          rawSurfaces: group.map((g) => g.surface),
          ruleKind: "single",
        });
      }
      index = next > index + 1 ? next : index + 1;
    }
    return groups;
  }

  function isSuggestableUnit(unit) {
    if (!unit || unit.skipped) return false;
    const surface = String(unit.surface || "").trim();
    if (!hasJapanese(surface)) return false;
    return surface.length > 0;
  }

  function tryAddItem(items, seen, item) {
    if (items.length >= MAX_ITEMS) return false;
    const fingerprint = String(item.fingerprint || "").trim();
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    items.push(item);
    return true;
  }

  async function collectSuggestions(texts) {
    const lex = global.HwMgLexicon;
    if (!lex?.analyzeText) return [];

    await lex.ensureLoaded?.();

    const items = [];
    const seen = new Set();

    for (const text of texts || []) {
      for (const sentence of splitSentences(text)) {
        const analysis = await lex.analyzeText(sentence);
        const units = analysis?.units || [];
        const mergedSurfaces = new Set();

        for (const group of groupUnmergedSingles(units)) {
          const rawSurfaces = group.rawSurfaces || [];
          const surface = group.surface;

          if (rawSurfaces.length === 2 && rawSurfaces[1] === "々") {
            if (surfaceCovered(lex, surface)) continue;
            if (
              tryAddItem(items, seen, {
                fingerprint: "force:" + surface,
                surface,
                kind: "force_unit",
                title: "Keep whole: " + surface,
                example: sentence,
                draft: { forceUnit: surface },
              })
            ) {
              rawSurfaces.forEach((s) => mergedSurfaces.add(s));
            }
            continue;
          }

          if (rawSurfaces.length < 2 || group.ruleKind !== "single") continue;
          if (surfaceCovered(lex, surface, rawSurfaces)) continue;

          if (
            tryAddItem(items, seen, {
              fingerprint: "merge:" + rawSurfaces.join("|"),
              surface,
              kind: "merge",
              title: "Merge: " + rawSurfaces.join(" + "),
              example: sentence,
              draft: { mergeSurfaces: rawSurfaces.slice() },
            })
          ) {
            rawSurfaces.forEach((s) => mergedSurfaces.add(s));
          }
        }

        for (const unit of units) {
          if (!isSuggestableUnit(unit)) continue;
          const surface = unit.surface;
          const rawSurfaces = unit.rawSurfaces || [surface];
          if (mergedSurfaces.has(surface)) continue;
          if (surfaceCovered(lex, surface, rawSurfaces)) continue;

          tryAddItem(items, seen, {
            fingerprint: "custom:" + surface,
            surface,
            kind: "custom",
            title: "Define: " + surface,
            example: sentence,
            draft: {},
          });
          if (items.length >= MAX_ITEMS) return items;
        }

        if (items.length >= MAX_ITEMS) return items;
      }
    }

    return items;
  }

  async function queueFromPublish({ assignment, worksheetId, worksheetTitle, teacherUsername }) {
    const texts = extractJapaneseTexts(assignment);
    const items = await collectSuggestions(texts);
    if (!items.length) {
      return { added: 0, skipped: 0, pending: 0, texts: texts.length, candidates: 0 };
    }

    const res = await fetch("/api/mg-lexicon/suggest-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername,
        worksheetId,
        worksheetTitle,
        items,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Suggest failed.");
    return {
      added: data.added || 0,
      skipped: data.skipped || 0,
      pending: data.pending || 0,
      texts: texts.length,
      candidates: items.length,
    };
  }

  global.HwMgLexiconSuggest = {
    extractJapaneseTexts,
    collectSuggestions,
    queueFromPublish,
  };
})(window);
