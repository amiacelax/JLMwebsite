/**
 * Parse / serialize Lantern Word Hunt lists (word + reading + English).
 */
(function (global) {
  function parseLines(text) {
    const words = [];
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      let parts;
      if (trimmed.includes("\t")) {
        parts = trimmed.split("\t").map((p) => p.trim());
      } else if (trimmed.includes("|")) {
        parts = trimmed.split("|").map((p) => p.trim());
      } else {
        const m = trimmed.match(/^(\S+)\s+([^\s]+(?:\s+[^\s]+)*?)\s*[-–—]\s*(.+)$/);
        if (m) {
          parts = [m[1], m[2], m[3]];
        } else {
          const bits = trimmed.split(/\s{2,}/).map((p) => p.trim());
          if (bits.length >= 2) parts = bits;
        }
      }

      if (!parts || parts.length < 2) continue;
      const word = String(parts[0] || "").trim();
      const reading = String(parts[1] || "")
        .trim()
        .split(/\s*[／/]\s*/)[0]
        .trim();
      const en = String(parts[2] || "").trim();
      if (!word || !reading) continue;
      words.push({ word, reading, en });
    }
    return words;
  }

  function serializeWords(words) {
    return (words || [])
      .map((item) => {
        const word = String(item.word || "").trim();
        const reading = String(item.reading || "").trim();
        const en = String(item.en || "").trim();
        return en ? word + "\t" + reading + "\t" + en : word + "\t" + reading;
      })
      .join("\n");
  }

  global.LanternWordFormat = { parseLines, serializeWords };
})(typeof window !== "undefined" ? window : globalThis);
