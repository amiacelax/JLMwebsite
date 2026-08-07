/**
 * Magnifying glass lexicon ΓÇö edit CUSTOM and LEMMA_QUERY over time.
 * Checked before Jisho for readings and short glosses.
 */
(function (global) {
  /**
   * Commas, periods, brackets, etc. ΓÇö not lookup targets.
   * Do NOT include πâ╝ (katakana/hiragana long vowel). It belongs inside
   * words like πé│πâ╝πâÆπâ╝ / πéëπâ╝πéüπéô, not as a segment boundary.
   */
  const PUNCT_RE =
    /^[\sπÇüπÇé∩╝Ä∩╝î,.!?∩╝ü∩╝ƒ∩╝Ü:∩╝¢;πÇîπÇìπÇÄπÇÅ∩╝ê∩╝ë()\[\]{}ΓÇªπâ╗~∩╜₧\-ΓÇö'\"ΓÇ£ΓÇ¥ΓÇÿΓÇÖ]+$/;

  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fffπÇàπâ╝]/;
  const LATIN_OR_DIGIT_RE = /^[A-Za-z0-9∩╝í-∩╝║∩╜ü-∩╜Ü∩╝É-∩╝Ö][A-Za-z0-9∩╝í-∩╝║∩╜ü-∩╜Ü∩╝É-∩╝Ö\-_.']*$/;

  /** Never lookup/highlight these on their own (particles, etc.). */
  const SKIP_SURFACE = new Set([
    "πéÆ",
    "πéô",
    "πüá",
    "πü«",
    "πü»",
    "πüî",
    "πü½",
    "πüº",
    "πü¿",
    "πüª",
    "πéé",
    "πüï",
    "πéê",
    "πü¡",
    "πü¬",
  ]);

  /** Custom reading + gloss ΓÇö wins over Jisho; also makes these highlightable/clickable. */
  const CUSTOM = {
    Σ╗òΣ║ï: { reading: "πüùπüöπü¿", definition: "work; job" },
    πéäπéüπüƒπüä: { reading: "πéäπéüπüƒπüä", definition: "want to quit (∩╜₧πüƒπüä)" },
    πüƒπüä: { reading: "πüƒπüä", definition: "want (∩╜₧πüƒπüä)" },
    πüæπü⌐: { reading: "πüæπü⌐", definition: "but" },
    Σ╕¡πÇà: { reading: "πü¬πüïπü¬πüï", definition: "quite; considerably; not easily" },
    πüáπüúπüƒ: { reading: "πüáπüúπüƒ", definition: "was; were (past)" },
    πüºπüùπüƒ: { reading: "πüºπüùπüƒ", definition: "was; were (polite past)" },
    πü¬πüïπüúπüƒ: { reading: "πü¬πüïπüúπüƒ", definition: "was not; were not" },
    πüÿπéâπü¬πüïπüúπüƒ: { reading: "πüÿπéâπü¬πüïπüúπüƒ", definition: "was not (casual)" },
    πüºπü»πü¬πüïπüúπüƒ: { reading: "πüºπü»πü¬πüïπüúπüƒ", definition: "was not (formal)" },
  };

  /** Clicked surface ΓåÆ dictionary headword for Jisho. */
  const LEMMA_QUERY = {
    Φíîπüì: "ΦíîπüÅ",
    πéäπéü: "πéäπéüπéï",
    πéäπéüπüƒπüä: "πéäπéüπéï",
  };

  /**
   * Token-merge rules ΓÇö kuromoji often splits compounds and conjugations that
   * students should treat as one lookup unit. Extend these lists over time.
   */
  const MERGE_RULES = {
    /**
     * Noun stem + bound suffix (kuromoji: σìÆµÑ¡+σ╝Å, σÅéσèá+ΦÇà).
     * Also matches pos_detail_1 === "µÄÑσ░╛" when the suffix is not listed here.
     */
    compoundSuffixSurfaces: [
      "σ╝Å",
      "Σ╝Ü",
      "ΦÇà",
      "σ«╢",
      "σôí",
      "Θñ¿",
      "µëÇ",
      "σá┤",
      "τòî",
      "τºæ",
      "Θâ¿",
      "σ«ñ",
      "σ▒Ç",
      "ΘÖó",
      "σ£Æ",
      "Φ│₧",
      "µûÖ",
      "Φ▓╗",
      "σê╕",
      "τÑ¿",
      "τ┤Ö",
      "τë⌐",
      "σôü",
      "Θí₧",
      "τ¿«",
      "σ₧ï",
      "µÇº",
      "σ║ª",
      "τÄç",
      "σè¢",
      "µäƒ",
      "Φª│",
      "σ¡ª",
      "µÑ¡",
      "σü┤",
      "σåà",
      "σñû",
      "σëì",
      "σ╛î",
      "Σ╕¡",
      "µÖé",
      "µ£ƒ",
    ],

    /**
     * Exact surface chains kuromoji emits as separate tokens.
     * Example: πü⌐πüåπüáπüúπüƒ ΓåÆ πü⌐πüå / πüáπüú / πüƒ ΓÇö merge the last two to πüáπüúπüƒ.
     */
    surfaceSequences: [
      { surfaces: ["πüáπüú", "πüƒ"] },
      { surfaces: ["πüºπüù", "πüƒ"] },
      { surfaces: ["πü¬πüïπüú", "πüƒ"] },
      { surfaces: ["πüÿπéâ", "πü¬πüïπüú", "πüƒ"] },
      { surfaces: ["πüºπü»", "πü¬πüïπüú", "πüƒ"] },
    ],

    /**
     * Head/tail token patterns for conjugation splits (longer/specific first).
     */
    patterns: [
      {
        id: "i-adj-past",
        head: (span) => span.token?.pos === "σ╜óσ«╣Φ⌐₧" && span.surface.endsWith("πüïπüú"),
        tail: (span) => span.surface === "πüƒ" && span.token?.pos === "σè⌐σïòΦ⌐₧",
      },
      {
        id: "verb-tta",
        head: (span) => span.token?.pos === "σïòΦ⌐₧" && span.surface.endsWith("πüú"),
        tail: (span) => span.surface === "πüƒ" && span.token?.pos === "σè⌐σïòΦ⌐₧",
      },
      {
        id: "verb-nda",
        head: (span) => span.token?.pos === "σïòΦ⌐₧" && span.surface.endsWith("πéô"),
        tail: (span) => span.surface === "πüá" && span.token?.pos === "σè⌐σïòΦ⌐₧",
      },
      {
        id: "verb-ta",
        head: (span) => span.token?.pos === "σïòΦ⌐₧",
        tail: (span) => span.surface === "πüƒ" && span.token?.pos === "σè⌐σïòΦ⌐₧",
      },
    ],
  };

  const COMPOUND_SUFFIX_SET = new Set(MERGE_RULES.compoundSuffixSurfaces);

  const BASELINE_SKIP = new Set(SKIP_SURFACE);
  const BASELINE_CUSTOM = { ...CUSTOM };
  const BASELINE_LEMMA = { ...LEMMA_QUERY };
  const BASELINE_SEQUENCES = MERGE_RULES.surfaceSequences.map((s) => ({
    surfaces: [...s.surfaces],
  }));
  const SEGMENT_RULES = {
    surfaceSequences: [],
  };

  /** Whole surfaces always kept together (code defaults + KV overlay). */
  let FORCE_UNITS = [];
  let overlayVersion = null;
  let loadPromise = null;
  /** Temporary draft rules while teacher tests unsaved card edits in Lookup Lexicon. */
  let previewLayer = null;

  function setPreview(layer) {
    previewLayer = layer && typeof layer === "object" ? layer : null;
  }

  function clearPreview() {
    previewLayer = null;
  }

  function hasPreviewCustom(surface) {
    const entry = previewLayer?.custom?.[surface];
    return Boolean(entry?.reading || entry?.definition);
  }

  function getPreview() {
    return previewLayer;
  }

  function hasActivePreview() {
    return Boolean(
      previewLayer?.segmentSurfaces?.length ||
        (previewLayer?.mergeSurfaces?.length && previewLayer.mergeSurfaces.length >= 2)
    );
  }

  function applyGlobalOverlay(overlay) {
    if (!overlay || typeof overlay !== "object") return;

    SKIP_SURFACE.clear();
    BASELINE_SKIP.forEach((s) => SKIP_SURFACE.add(s));
    Object.keys(CUSTOM).forEach((k) => delete CUSTOM[k]);
    Object.assign(CUSTOM, BASELINE_CUSTOM);
    Object.keys(LEMMA_QUERY).forEach((k) => delete LEMMA_QUERY[k]);
    Object.assign(LEMMA_QUERY, BASELINE_LEMMA);
    MERGE_RULES.surfaceSequences = BASELINE_SEQUENCES.map((s) => ({
      surfaces: [...s.surfaces],
    }));
    FORCE_UNITS = [];

    (overlay.skipSurface || []).forEach((surface) => {
      if (!surface) return;
      SKIP_SURFACE.add(surface);
      delete CUSTOM[surface];
    });

    Object.assign(CUSTOM, overlay.custom || {});
    Object.assign(LEMMA_QUERY, overlay.lemmaQuery || {});

    (overlay.mergeSurfaceSequences || []).forEach((seq) => {
      if (!seq?.surfaces?.length || seq.surfaces.length < 2) return;
      const key = seq.surfaces.join("|");
      const exists = MERGE_RULES.surfaceSequences.some((item) => item.surfaces.join("|") === key);
      if (!exists) MERGE_RULES.surfaceSequences.push({ surfaces: [...seq.surfaces] });
    });

    SEGMENT_RULES.surfaceSequences = [];
    (overlay.segmentSurfaceSequences || []).forEach((seq) => {
      if (!seq?.surfaces?.length || seq.surfaces.length < 2) return;
      const key = seq.surfaces.join("|");
      const exists = SEGMENT_RULES.surfaceSequences.some((item) => item.surfaces.join("|") === key);
      if (!exists) SEGMENT_RULES.surfaceSequences.push({ surfaces: [...seq.surfaces] });
      removeMergeSequenceFromRules(seq.surfaces);
    });

    FORCE_UNITS = [...new Set((overlay.forceUnits || []).map((s) => String(s || "").trim()).filter(Boolean))];
    const skipSet = new Set(overlay.skipSurface || []);
    if (skipSet.size) {
      FORCE_UNITS = FORCE_UNITS.filter((unit) => !skipSet.has(unit));
    }
    overlayVersion = overlay.updatedAt || overlayVersion;
  }

  function ensureLoaded() {
    if (!loadPromise) {
      loadPromise = fetch("/api/mg-lexicon")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.overlay) applyGlobalOverlay(data.overlay);
          if (data?.version) overlayVersion = data.version;
        })
        .catch(() => {});
    }
    return loadPromise;
  }

  function buildTokenSpans(tokens, text) {
    let pos = 0;
    return tokens.map((token) => {
      const sf = token.surface_form || "";
      let start = text.indexOf(sf, pos);
      if (start < 0) start = pos;
      const end = start + sf.length;
      pos = Math.max(pos, end);
      return { token, surface: sf, start, end };
    });
  }

  function pickForceUnit(text, offset) {
    if (!FORCE_UNITS.length || !text || offset < 0) return null;
    const ordered = [...FORCE_UNITS].sort((a, b) => b.length - a.length);
    for (const unit of ordered) {
      let from = 0;
      while (from <= text.length) {
        const start = text.indexOf(unit, from);
        if (start < 0) break;
        const end = start + unit.length;
        if (offset >= start && offset < end) {
          if (isSkipped(unit, null)) return null;
          return { surface: unit, start, end, lemma: null, reading: null };
        }
        from = start + 1;
      }
    }
    return null;
  }

  async function simulateSplit(text) {
    await ensureLoaded();
    const sample = String(text || "").trim();
    if (!sample) return [];

    const auto = global.HwFuriganaAuto;
    if (!auto?.ensureTokenizer) return [];
    try {
      const tokenizer = await auto.ensureTokenizer();
      const tokens = tokenizer.tokenize(sample);
      const rawSpans = buildTokenSpans(tokens, sample);
      const merged = mergeTokenSpans(rawSpans);
      return merged.map((span) => ({
        surface: span.surface,
        skipped: isSkipped(span.surface, span.token),
      }));
    } catch {
      return [];
    }
  }

  function katakanaToHiragana(str) {
    return String(str || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  function readingFromToken(token) {
    return katakanaToHiragana(token?.reading || token?.pronunciation || "");
  }

  function joinedReadingFromSpans(spans) {
    return spans.map((span) => readingFromToken(span.token)).join("");
  }

  function isCompoundSuffixSpan(span) {
    const token = span?.token;
    if (!token || token.pos !== "σÉìΦ⌐₧") return false;
    if (token.pos_detail_1 === "µÄÑσ░╛Φ╛₧" || token.pos_detail_1 === "µÄÑσ░╛") return true;
    return COMPOUND_SUFFIX_SET.has(span.surface);
  }

  function isCompoundHeadSpan(span) {
    const token = span?.token;
    if (!token || token.pos !== "σÉìΦ⌐₧") return false;
    if (token.pos_detail_1 === "µÄÑσ░╛Φ╛₧" || token.pos_detail_1 === "µÄÑσ░╛") return false;
    return true;
  }

  function surfacesMatch(spans, start, surfaces) {
    if (start + surfaces.length > spans.length) return false;
    for (let i = 0; i < surfaces.length; i += 1) {
      if (spans[start + i].surface !== surfaces[i]) return false;
    }
    return true;
  }

  function combineSpans(spans, start, count, options) {
    const slice = spans.slice(start, start + count);
    const head = slice[0];
    const tail = slice[slice.length - 1];
    const surface = slice.map((span) => span.surface).join("");
    const token = { ...tail.token, basic_form: surface };
    if (options?.joinReading) {
      const joined = joinedReadingFromSpans(slice);
      if (joined) token.reading = joined;
    }
    return {
      token,
      surface,
      start: head.start,
      end: tail.end,
    };
  }

  function removeMergeSequenceFromRules(surfaces) {
    const key = surfaces.join("|");
    MERGE_RULES.surfaceSequences = MERGE_RULES.surfaceSequences.filter(
      (item) => item.surfaces.join("|") !== key
    );
  }

  function isSegmentSequence(surfaces) {
    const key = surfaces.join("|");
    return SEGMENT_RULES.surfaceSequences.some((item) => item.surfaces.join("|") === key);
  }

  function storedSegmentRulesLongestFirst() {
    return [...SEGMENT_RULES.surfaceSequences].sort(
      (a, b) => b.surfaces.join("").length - a.surfaces.join("").length
    );
  }

  function pickStoredSegmentAt(sample, index) {
    for (const rule of storedSegmentRulesLongestFirst()) {
      const parts = rule.surfaces || [];
      const combined = parts.join("");
      if (!combined || !sample.startsWith(combined, index)) continue;
      return parts;
    }
    return null;
  }

  function pickForceUnitAt(text, index) {
    if (!FORCE_UNITS.length || !text || index < 0) return null;
    const ordered = [...FORCE_UNITS].sort((a, b) => b.length - a.length);
    for (const unit of ordered) {
      if (unit && text.startsWith(unit, index)) {
        if (isSkipped(unit, null)) return null;
        return { surface: unit, start: index, end: index + unit.length, lemma: null, reading: null };
      }
    }
    return null;
  }

  function trySequenceMerge(spans, index) {
    const ordered = [...MERGE_RULES.surfaceSequences].sort(
      (a, b) => b.surfaces.length - a.surfaces.length
    );
    for (const rule of ordered) {
      if (!surfacesMatch(spans, index, rule.surfaces)) continue;
      if (isSegmentSequence(rule.surfaces)) continue;
      return {
        span: combineSpans(spans, index, rule.surfaces.length),
        count: rule.surfaces.length,
      };
    }
    return null;
  }

  function tryPatternMerge(spans, index) {
    if (index + 1 >= spans.length) return null;
    const head = spans[index];
    const tail = spans[index + 1];
    for (const rule of MERGE_RULES.patterns) {
      if (rule.head(head) && rule.tail(tail)) {
        return combineSpans(spans, index, 2);
      }
    }
    return null;
  }

  function tryCompoundSuffixMerge(spans, index) {
    if (index + 1 >= spans.length) return null;
    const head = spans[index];
    const tail = spans[index + 1];
    if (isSegmentSequence([head.surface, tail.surface])) return null;
    if (!isCompoundHeadSpan(head) || !isCompoundSuffixSpan(tail)) return null;
    return combineSpans(spans, index, 2, { joinReading: true });
  }

  function tryPreviewSequenceMerge(spans, index) {
    const surfaces = previewLayer?.mergeSurfaces;
    if (!Array.isArray(surfaces) || surfaces.length < 2) return null;
    if (!surfacesMatch(spans, index, surfaces)) return null;
    return {
      span: combineSpans(spans, index, surfaces.length),
      count: surfaces.length,
    };
  }

  function mergeTokenSpansWithMeta(spans) {
    if (!Array.isArray(spans) || !spans.length) return spans || [];

    const merged = [];
    let index = 0;
    while (index < spans.length) {
      const previewSequence = tryPreviewSequenceMerge(spans, index);
      if (previewSequence) {
        const slice = spans.slice(index, index + previewSequence.count);
        merged.push({
          ...previewSequence.span,
          rawSurfaces: slice.map((span) => span.surface),
          ruleKind: "preview-sequence",
        });
        index += previewSequence.count;
        continue;
      }

      const sequence = trySequenceMerge(spans, index);
      if (sequence) {
        const slice = spans.slice(index, index + sequence.count);
        merged.push({
          ...sequence.span,
          rawSurfaces: slice.map((span) => span.surface),
          ruleKind: "sequence",
        });
        index += sequence.count;
        continue;
      }

      const pattern = tryPatternMerge(spans, index);
      if (pattern) {
        merged.push({
          ...pattern,
          rawSurfaces: [spans[index].surface, spans[index + 1].surface],
          ruleKind: "pattern",
        });
        index += 2;
        continue;
      }

      const compound = tryCompoundSuffixMerge(spans, index);
      if (compound) {
        merged.push({
          ...compound,
          rawSurfaces: [spans[index].surface, spans[index + 1].surface],
          ruleKind: "compound",
        });
        index += 2;
        continue;
      }

      const span = spans[index];
      merged.push({
        ...span,
        rawSurfaces: [span.surface],
        ruleKind: "single",
      });
      index += 1;
    }
    return merged;
  }

  function mergeTokenSpans(spans) {
    return mergeTokenSpansWithMeta(spans).map(({ token, surface, start, end }) => ({
      token,
      surface,
      start,
      end,
    }));
  }

  /** Longest-first particles / glue for quick hover without kuromoji. */
  const QUICK_BOUNDARY_SURFACES = [
    "πüºπü»",
    "πüÿπéâ",
    "πüïπéë",
    "πü╛πüº",
    "πéêπéè",
    "πü¬πü⌐",
    "πüæπü⌐",
    "πü«πüº",
    "πü«πü½",
    "πüúπüª",
    "πü¬πüî",
    "πü¬πüï",
    "πéÆ",
    "πü»",
    "πüî",
    "πü½",
    "πüº",
    "πü¿",
    "πüª",
    "πéé",
    "πüï",
    "πéê",
    "πü¡",
    "πü«",
    "πü╕",
    "πéô",
    "πüá",
    "πü¬",
  ].sort((a, b) => b.length - a.length);

  function quickBoundaryLength(text, index) {
    const ch = text[index];
    if (!ch) return 0;
    if (PUNCT_RE.test(ch) || !JA_CHAR.test(ch)) return 1;
    for (const surface of QUICK_BOUNDARY_SURFACES) {
      if (text.startsWith(surface, index)) return surface.length;
    }
    return 0;
  }

  function offsetQuickUnit(unit, delta) {
    return { ...unit, start: unit.start + delta, end: unit.end + delta };
  }

  function quickUnitsBase(sample) {
    const units = [];
    let i = 0;
    while (i < sample.length) {
      const boundary = quickBoundaryLength(sample, i);
      if (boundary) {
        const surface = sample.slice(i, i + boundary);
        if (JA_CHAR.test(surface[0]) && !PUNCT_RE.test(surface)) {
          units.push({
            surface,
            start: i,
            end: i + boundary,
            skip: isSkipped(surface, null),
          });
        }
        i += boundary;
        continue;
      }

      const start = i;
      i += 1;
      while (i < sample.length && !quickBoundaryLength(sample, i)) i += 1;
      const surface = sample.slice(start, i);
      units.push({
        surface,
        start,
        end: i,
        skip: isSkipped(surface, null),
      });
    }
    return units;
  }

  function quickUnitsWithMerge(sample, surfaces) {
    const combined = surfaces.join("");
    const start = sample.indexOf(combined);
    if (start >= 0) {
      const units = [];
      if (start > 0) {
        units.push(...quickUnitsBase(sample.slice(0, start)).map((unit) => offsetQuickUnit(unit, 0)));
      }
      units.push({
        surface: combined,
        start,
        end: start + combined.length,
        skip: isSkipped(combined, null) && !hasPreviewCustom(combined),
      });
      const after = start + combined.length;
      if (after < sample.length) {
        units.push(
          ...quickUnitsBase(sample.slice(after)).map((unit) => offsetQuickUnit(unit, after))
        );
      }
      return units;
    }
    return quickUnitsBase(sample);
  }

  function quickUnitsWithSegments(sample, segments) {
    const units = [];
    let cursor = 0;
    for (const seg of segments) {
      const surface = String(seg || "").trim();
      if (!surface) continue;
      const start = sample.indexOf(surface, cursor);
      if (start < 0) continue;
      if (start > cursor) {
        units.push(
          ...quickUnitsBase(sample.slice(cursor, start)).map((unit) => offsetQuickUnit(unit, cursor))
        );
      }
      units.push({
        surface,
        start,
        end: start + surface.length,
        skip: isSkipped(surface, null) && !hasPreviewCustom(surface),
      });
      cursor = start + surface.length;
    }
    if (cursor < sample.length) {
      units.push(
        ...quickUnitsBase(sample.slice(cursor)).map((unit) => offsetQuickUnit(unit, cursor))
      );
    }
    return units.length ? units : quickUnitsBase(sample);
  }

  function quickUnitsWithOverlayRules(sample) {
    const units = [];
    let i = 0;
    while (i < sample.length) {
      const segmentParts = pickStoredSegmentAt(sample, i);
      if (segmentParts?.length) {
        let pos = i;
        for (const surface of segmentParts) {
          units.push({
            surface,
            start: pos,
            end: pos + surface.length,
            skip: isSkipped(surface, null) && !hasPreviewCustom(surface),
          });
          pos += surface.length;
        }
        i = pos;
        continue;
      }

      const forced = pickForceUnitAt(sample, i);
      if (forced) {
        units.push({
          ...forced,
          skip: isSkipped(forced.surface, null) && !hasPreviewCustom(forced.surface),
        });
        i = forced.end;
        continue;
      }

      const rest = quickUnitsBase(sample.slice(i));
      if (!rest.length) break;
      units.push(offsetQuickUnit(rest[0], i));
      i = rest[0].end + i;
    }
    return units.length ? units : quickUnitsBase(sample);
  }

  function quickUnits(text) {
    const sample = String(text || "");
    if (previewLayer?.mergeSurfaces?.length >= 2) {
      return quickUnitsWithMerge(sample, previewLayer.mergeSurfaces);
    }
    if (previewLayer?.segmentSurfaces?.length) {
      return quickUnitsWithSegments(sample, previewLayer.segmentSurfaces);
    }
    if (SEGMENT_RULES.surfaceSequences.length || FORCE_UNITS.length) {
      return quickUnitsWithOverlayRules(sample);
    }
    return quickUnitsBase(sample);
  }

  function pickQuickUnit(text, offset) {
    const sample = String(text || "");
    if (!sample || offset < 0 || offset >= sample.length) return null;

    const units = quickUnits(sample);
    const index = units.findIndex((unit) => offset >= unit.start && offset < unit.end);
    if (index < 0) return null;

    const pickFromIndex = (i) => {
      const unit = units[i];
      if (!unit || unit.skip) return null;
      return enrich({
        surface: unit.surface,
        start: unit.start,
        end: unit.end,
        lemma: null,
        reading: null,
      });
    };

    const direct = pickFromIndex(index);
    if (direct) return direct;

    let left = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      left = pickFromIndex(i);
      if (left) break;
    }
    let right = null;
    for (let i = index + 1; i < units.length; i += 1) {
      right = pickFromIndex(i);
      if (right) break;
    }
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;

    const distLeft = Math.min(Math.abs(offset - left.start), Math.abs(offset - left.end));
    const distRight = Math.min(Math.abs(offset - right.start), Math.abs(offset - right.end));
    if (Math.min(distLeft, distRight) > 2) return null;
    return distLeft <= distRight ? left : right;
  }

  async function analyzeText(text) {
    await ensureLoaded();
    const sample = String(text || "").trim();
    if (!sample) return { text: sample, units: [] };

    const auto = global.HwFuriganaAuto;
    if (!auto?.ensureTokenizer) return { text: sample, units: [] };
    try {
      const tokenizer = await auto.ensureTokenizer();
      const tokens = tokenizer.tokenize(sample);
      const rawSpans = buildTokenSpans(tokens, sample);
      const units = mergeTokenSpansWithMeta(rawSpans).map((span) => ({
        surface: span.surface,
        start: span.start,
        end: span.end,
        rawSurfaces: span.rawSurfaces,
        ruleKind: span.ruleKind,
        token: span.token,
        skipped: isSkipped(span.surface, span.token),
      }));
      return { text: sample, units };
    } catch {
      return { text: sample, units: [] };
    }
  }

  function isLatinOrDigits(surface, token) {
    const s = String(surface || "").trim();
    if (!s) return true;
    if (JA_CHAR.test(s)) return false;
    if (LATIN_OR_DIGIT_RE.test(s)) return true;
    const pos = token?.pos || "";
    const detail = [token?.pos_detail_1, token?.pos_detail_2, token?.pos_detail_3]
      .filter(Boolean)
      .join(" ");
    if (/σñûσ¢╜|πéóπâ½πâòπéíπâÖπââπâê|µò░Φ⌐₧/.test(pos + detail) && !JA_CHAR.test(s)) return true;
    return false;
  }

  function isPunctuation(surface, token) {
    const s = String(surface || "");
    if (!s) return true;
    if (PUNCT_RE.test(s)) return true;
    const pos = token?.pos || "";
    if (pos === "Φ¿ÿσÅ╖" || pos === "Φú£σè⌐Φ¿ÿσÅ╖") return true;
    return false;
  }

  function isSkipped(surface, token) {
    if (hasPreviewCustom(surface)) return false;
    if (SKIP_SURFACE.has(surface)) return true;
    if (CUSTOM[surface]) return false;
    if (isLatinOrDigits(surface, token)) return true;
    if (isPunctuation(surface, token)) return true;
    const pos = token?.pos || "";
    if (pos === "σè⌐Φ⌐₧") return true;
    if (pos === "σè⌐σïòΦ⌐₧" && /^(πüá|πüºπüéπéï|πüºπüÖ|πüÿπéâ|πüºπü»)$/.test(surface)) return true;
    return false;
  }

  function customEntry(surface, lemma) {
    if (previewLayer?.custom?.[surface]) return previewLayer.custom[surface];
    return CUSTOM[surface] || (lemma && CUSTOM[lemma]) || null;
  }

  function resolve(surface, lemma) {
    const custom = customEntry(surface, lemma);
    const query =
      previewLayer?.lemmaQuery?.[surface] ||
      LEMMA_QUERY[surface] ||
      previewLayer?.lemmaQuery?.[lemma] ||
      LEMMA_QUERY[lemma] ||
      (surface.length > 1 ? surface : null) ||
      lemma ||
      surface;
    const jishoUrl = "https://jisho.org/search/" + encodeURIComponent(query);
    if (custom) {
      return {
        query,
        reading: custom.reading,
        definition: custom.definition,
        jishoUrl,
      };
    }
    return { query, reading: null, definition: null, jishoUrl };
  }

  function enrich(unit) {
    if (!unit) return null;
    const custom = customEntry(unit.surface, unit.lemma);
    if (custom) {
      unit.reading = custom.reading || unit.reading;
      unit.definition = custom.definition;
    }
    const resolved = resolve(unit.surface, unit.lemma);
    unit.query = resolved.query;
    if (!unit.definition && resolved.definition) unit.definition = resolved.definition;
    if (!unit.reading && resolved.reading) unit.reading = resolved.reading;
    unit.jishoUrl = resolved.jishoUrl;
    return unit;
  }

  async function inspectWordInText(text, target) {
    const analysis = await analyzeText(text);
    const sample = analysis.text || String(text || "").trim();
    const word = String(target || "").trim();
    const units = analysis.units || [];
    if (!sample || !word) {
      return { text: sample, word, units, relevantUnits: [], splitsNow: "ΓÇö", highlighted: false };
    }

    let targetStart = sample.indexOf(word);
    const targetEnd = targetStart >= 0 ? targetStart + word.length : -1;

    let relevantUnits = [];
    if (targetStart >= 0) {
      relevantUnits = units.filter((u) => u.start < targetEnd && u.end > targetStart);
    }
    const exactUnit = units.find((u) => u.surface === word);
    if (exactUnit) {
      relevantUnits = [exactUnit];
    } else if (!relevantUnits.length) {
      relevantUnits = units.filter(
        (u) => word.includes(u.surface) || u.surface.includes(word)
      );
    }

    function unitPreview(unit) {
      const highlighted = !unit.skipped;
      const resolved = resolve(unit.surface, unit.token?.basic_form);
      let reading = resolved.reading;
      if (!reading && unit.token) reading = readingFromToken(unit.token);
      return {
        surface: unit.surface,
        highlighted,
        reading: reading || null,
        definition: resolved.definition || null,
        jishoQuery: resolved.query,
        rawSurfaces: unit.rawSurfaces || [unit.surface],
        ruleKind: unit.ruleKind,
        start: unit.start,
        end: unit.end,
      };
    }

    const pieces = relevantUnits.map(unitPreview);
    const highlighted = pieces.some((p) => p.highlighted);
    const primary = pieces.find((p) => p.surface === word) || pieces.find((p) => p.highlighted) || pieces[0];
    const isSplit =
      relevantUnits.length > 1 ||
      (exactUnit?.rawSurfaces?.length > 1 && exactUnit.ruleKind === "single");

    return {
      text: sample,
      word,
      targetStart,
      targetEnd,
      units,
      relevantUnits,
      exactUnit,
      pieces,
      splitsNow: pieces.length ? pieces.map((p) => p.surface).join(" ┬╖ ") : "ΓÇö",
      rawSplit: pieces.flatMap((p) => p.rawSurfaces),
      isSplit,
      highlighted,
      reading: primary?.reading || null,
      definition: primary?.definition || null,
      jishoQuery: primary?.jishoQuery || null,
    };
  }

  global.HwMgLexicon = {
    CUSTOM,
    LEMMA_QUERY,
    MERGE_RULES,
    SKIP_SURFACE,
    isPunctuation,
    isLatinOrDigits,
    isSkipped,
    customEntry,
    resolve,
    enrich,
    mergeTokenSpans,
    mergeTokenSpansWithMeta,
    analyzeText,
    inspectWordInText,
    getForceUnits: () => FORCE_UNITS,
    ensureLoaded,
    applyGlobalOverlay,
    pickForceUnit,
    pickQuickUnit,
    quickUnits,
    simulateSplit,
    setPreview,
    clearPreview,
    getPreview,
    hasActivePreview,
    getOverlayVersion: () => overlayVersion,
  };

  ensureLoaded();
})(window);
