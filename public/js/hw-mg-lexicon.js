/**
 * Magnifying glass lexicon — edit CUSTOM and LEMMA_QUERY over time.
 * Checked before Jisho for readings and short glosses.
 */
(function (global) {
  /** Commas, periods, brackets, etc. — not lookup targets. */
  const PUNCT_RE =
    /^[\s、。．，,.!?！？：:；;「」『』（）()\[\]{}…・~～\-—ー'\"“”‘’]+$/;

  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
  const LATIN_OR_DIGIT_RE = /^[A-Za-z0-9Ａ-Ｚａ-ｚ０-９][A-Za-z0-9Ａ-Ｚａ-ｚ０-９\-_.']*$/;

  /** Never lookup/highlight these on their own (particles, etc.). */
  const SKIP_SURFACE = new Set([
    "を",
    "ん",
    "だ",
    "の",
    "は",
    "が",
    "に",
    "で",
    "と",
    "て",
    "も",
    "か",
    "よ",
    "ね",
    "な",
  ]);

  /** Custom reading + gloss — wins over Jisho; also makes these highlightable/clickable. */
  const CUSTOM = {
    たい: { reading: "たい", definition: "want (～たい)" },
    けど: { reading: "けど", definition: "but" },
    中々: { reading: "なかなか", definition: "quite; considerably; not easily" },
    だった: { reading: "だった", definition: "was; were (past)" },
    でした: { reading: "でした", definition: "was; were (polite past)" },
    なかった: { reading: "なかった", definition: "was not; were not" },
    じゃなかった: { reading: "じゃなかった", definition: "was not (casual)" },
    ではなかった: { reading: "ではなかった", definition: "was not (formal)" },
  };

  /** Clicked surface → dictionary headword for Jisho. */
  const LEMMA_QUERY = {
    やめ: "やめる",
  };

  /**
   * Token-merge rules — kuromoji often splits compounds and conjugations that
   * students should treat as one lookup unit. Extend these lists over time.
   */
  const MERGE_RULES = {
    /**
     * Noun stem + bound suffix (kuromoji: 卒業+式, 参加+者).
     * Also matches pos_detail_1 === "接尾" when the suffix is not listed here.
     */
    compoundSuffixSurfaces: [
      "式",
      "会",
      "者",
      "家",
      "員",
      "館",
      "所",
      "場",
      "界",
      "科",
      "部",
      "室",
      "局",
      "院",
      "園",
      "賞",
      "料",
      "費",
      "券",
      "票",
      "紙",
      "物",
      "品",
      "類",
      "種",
      "型",
      "性",
      "度",
      "率",
      "力",
      "感",
      "観",
      "学",
      "業",
      "側",
      "内",
      "外",
      "前",
      "後",
      "中",
      "時",
      "期",
    ],

    /**
     * Exact surface chains kuromoji emits as separate tokens.
     * Example: どうだった → どう / だっ / た — merge the last two to だった.
     */
    surfaceSequences: [
      { surfaces: ["だっ", "た"] },
      { surfaces: ["でし", "た"] },
      { surfaces: ["なかっ", "た"] },
      { surfaces: ["じゃ", "なかっ", "た"] },
      { surfaces: ["では", "なかっ", "た"] },
    ],

    /**
     * Head/tail token patterns for conjugation splits (longer/specific first).
     */
    patterns: [
      {
        id: "i-adj-past",
        head: (span) => span.token?.pos === "形容詞" && span.surface.endsWith("かっ"),
        tail: (span) => span.surface === "た" && span.token?.pos === "助動詞",
      },
      {
        id: "verb-tta",
        head: (span) => span.token?.pos === "動詞" && span.surface.endsWith("っ"),
        tail: (span) => span.surface === "た" && span.token?.pos === "助動詞",
      },
      {
        id: "verb-nda",
        head: (span) => span.token?.pos === "動詞" && span.surface.endsWith("ん"),
        tail: (span) => span.surface === "だ" && span.token?.pos === "助動詞",
      },
      {
        id: "verb-ta",
        head: (span) => span.token?.pos === "動詞",
        tail: (span) => span.surface === "た" && span.token?.pos === "助動詞",
      },
    ],
  };

  const COMPOUND_SUFFIX_SET = new Set(MERGE_RULES.compoundSuffixSurfaces);

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
    if (!token || token.pos !== "名詞") return false;
    if (token.pos_detail_1 === "接尾辞" || token.pos_detail_1 === "接尾") return true;
    return COMPOUND_SUFFIX_SET.has(span.surface);
  }

  function isCompoundHeadSpan(span) {
    const token = span?.token;
    if (!token || token.pos !== "名詞") return false;
    if (token.pos_detail_1 === "接尾辞" || token.pos_detail_1 === "接尾") return false;
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

  function trySequenceMerge(spans, index) {
    const ordered = [...MERGE_RULES.surfaceSequences].sort(
      (a, b) => b.surfaces.length - a.surfaces.length
    );
    for (const rule of ordered) {
      if (!surfacesMatch(spans, index, rule.surfaces)) continue;
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
    if (!isCompoundHeadSpan(head) || !isCompoundSuffixSpan(tail)) return null;
    return combineSpans(spans, index, 2, { joinReading: true });
  }

  function mergeTokenSpans(spans) {
    if (!Array.isArray(spans) || !spans.length) return spans || [];

    const merged = [];
    let index = 0;
    while (index < spans.length) {
      const sequence = trySequenceMerge(spans, index);
      if (sequence) {
        merged.push(sequence.span);
        index += sequence.count;
        continue;
      }

      const pattern = tryPatternMerge(spans, index);
      if (pattern) {
        merged.push(pattern);
        index += 2;
        continue;
      }

      const compound = tryCompoundSuffixMerge(spans, index);
      if (compound) {
        merged.push(compound);
        index += 2;
        continue;
      }

      merged.push(spans[index]);
      index += 1;
    }
    return merged;
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
    if (/外国|アルファベット|数詞/.test(pos + detail) && !JA_CHAR.test(s)) return true;
    return false;
  }

  function isPunctuation(surface, token) {
    const s = String(surface || "");
    if (!s) return true;
    if (PUNCT_RE.test(s)) return true;
    const pos = token?.pos || "";
    if (pos === "記号" || pos === "補助記号") return true;
    return false;
  }

  function isSkipped(surface, token) {
    if (CUSTOM[surface]) return false;
    if (isLatinOrDigits(surface, token)) return true;
    if (isPunctuation(surface, token)) return true;
    if (SKIP_SURFACE.has(surface)) return true;
    const pos = token?.pos || "";
    if (pos === "助詞") return true;
    if (pos === "助動詞" && /^(だ|である|です|じゃ|では)$/.test(surface)) return true;
    return false;
  }

  function customEntry(surface, lemma) {
    return CUSTOM[surface] || (lemma && CUSTOM[lemma]) || null;
  }

  function resolve(surface, lemma) {
    const custom = customEntry(surface, lemma);
    const query =
      LEMMA_QUERY[surface] ||
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
  };
})(window);
