/**
 * Parse lesson mistake notes from freeform paste text.
 *
 * Supported formats (one mistake per line):
 *   wrong --> correct
 *   wrong -> correct
 *   wrong - correct
 *   wrong    correct   (2+ spaces or tab)
 *   wrong　correct      (full-width space)
 *
 * Category for following lines:
 *   # grammar
 *   # vocab
 * Or per line: [vocab] くらま --> くるま
 *
 * Chains (A --> B --> C) become wrong=A, correct=C.
 */
(function (global) {
  const SEPARATOR = /\s*(?:-->|->|→|>|\/|\||:)\s*/;

  const VALID = new Set([
    "grammar",
    "vocab",
    "pronunciation",
    "kanji",
    "particle",
    "conjugation",
    "other",
  ]);

  const ALIASES = {
    grammar: "grammar",
    g: "grammar",
    gram: "grammar",
    vocab: "vocab",
    v: "vocab",
    vocabulary: "vocab",
    pronunciation: "pronunciation",
    pron: "pronunciation",
    kanji: "kanji",
    k: "kanji",
    particle: "particle",
    p: "particle",
    particles: "particle",
    conjugation: "conjugation",
    conj: "conjugation",
    c: "conjugation",
    other: "other",
    o: "other",
  };

  function normalizeCategory(raw, fallback) {
    const key = String(raw || "")
      .trim()
      .toLowerCase();
    const mapped = ALIASES[key];
    if (mapped && VALID.has(mapped)) return mapped;
    if (VALID.has(key)) return key;
    return fallback || "grammar";
  }

  function parsePairLine(body) {
    const trimmed = String(body || "").trim();
    if (!trimmed) return null;

    if (SEPARATOR.test(trimmed)) {
      const parts = trimmed
        .split(SEPARATOR)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        const text = parts[0];
        const correction = parts[parts.length - 1];
        const context =
          parts.length > 2 ? parts.slice(1, -1).join(" → ") : undefined;
        return { text, correction, context };
      }
    }

    const hyphen = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (hyphen) {
      return {
        text: hyphen[1].trim(),
        correction: hyphen[2].trim(),
      };
    }

    const tab = trimmed.match(/^(.+?)\t+(.+)$/);
    if (tab) {
      return { text: tab[1].trim(), correction: tab[2].trim() };
    }

    const wide = trimmed.match(/^(.+?)\u3000(.+)$/);
    if (wide) {
      return { text: wide[1].trim(), correction: wide[2].trim() };
    }

    const spaces = trimmed.match(/^(.+?)\s{2,}(.+)$/);
    if (spaces) {
      return { text: spaces[1].trim(), correction: spaces[2].trim() };
    }

    const two = trimmed.match(/^(\S+)\s+(\S+)$/);
    if (two) {
      return { text: two[1], correction: two[2] };
    }

    return { text: trimmed, correction: "" };
  }

  function parseBulkPaste(raw, defaultCategory) {
    const fallback = normalizeCategory(defaultCategory, "grammar");
    const lines = String(raw || "").split(/\r?\n/);
    const entries = [];
    const skipped = [];
    let currentCategory = fallback;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const hash = trimmed.match(/^#\s*([\w-]+)\s*$/i);
      if (hash) {
        currentCategory = normalizeCategory(hash[1], currentCategory);
        return;
      }

      let category = currentCategory;
      let body = trimmed;

      const tag = trimmed.match(/^\[([\w-]+)\]\s*(.+)$/i);
      if (tag) {
        category = normalizeCategory(tag[1], currentCategory);
        body = tag[2].trim();
      }

      const pair = parsePairLine(body);
      if (!pair || !pair.text) {
        skipped.push({ line: index + 1, text: trimmed });
        return;
      }

      entries.push({
        text: pair.text,
        correction: pair.correction || "",
        context: pair.context || "",
        category,
      });
    });

    return { entries, skipped };
  }

  global.HwMistakeParse = {
    normalizeCategory,
    parsePairLine,
    parseBulkPaste,
    categories: [...VALID],
  };
})(typeof window !== "undefined" ? window : globalThis);
