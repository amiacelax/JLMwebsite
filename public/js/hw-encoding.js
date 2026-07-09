/**
 * Repair UTF-8 Japanese text mis-read as Latin-1 (mojibake in older KV saves).
 * Handles pure mojibake strings and mixed JP + mangled punctuation (e.g. 行きたいã).
 */
(function (global) {
  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
  const JA_PUNCT = /[。、「」『』（）・…〜～]/;
  const LATIN1_HIGH = /[\u0080-\u00ff]/;
  const LATIN1_HIGH_RUN = /[\u0080-\u00ff]+/g;

  function hasJapanese(str) {
    return JA_CHAR.test(String(str || ""));
  }

  function looksRepaired(str) {
    return hasJapanese(str) || JA_PUNCT.test(str);
  }

  function decodeLatin1BytesAsUtf8(run, fatal) {
    try {
      const bytes = Uint8Array.from([...run].map((ch) => ch.charCodeAt(0) & 0xff));
      return new TextDecoder("utf-8", { fatal: Boolean(fatal) }).decode(bytes);
    } catch {
      return null;
    }
  }

  function repairMojibakeUtf8(str) {
    const value = String(str || "");
    if (!value || !LATIN1_HIGH.test(value)) return value;

    if (!hasJapanese(value)) {
      const repaired = decodeLatin1BytesAsUtf8(value, false);
      if (repaired && looksRepaired(repaired) && repaired !== value) return repaired;
      return value;
    }

    return value.replace(LATIN1_HIGH_RUN, (run) => {
      const repaired = decodeLatin1BytesAsUtf8(run, true);
      if (repaired && looksRepaired(repaired)) return repaired;
      const soft = decodeLatin1BytesAsUtf8(run, false);
      if (soft && looksRepaired(soft) && soft !== run) return soft;
      return run;
    });
  }

  function repairAssignment(assignment) {
    if (!assignment || typeof assignment !== "object") return assignment;

    function walk(value) {
      if (typeof value === "string") return repairMojibakeUtf8(value);
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === "object") {
        const out = {};
        Object.keys(value).forEach((key) => {
          out[key] = walk(value[key]);
        });
        return out;
      }
      return value;
    }

    return walk(assignment);
  }

  global.HwEncoding = {
    hasJapanese,
    repairMojibakeUtf8,
    repairAssignment,
  };
})(window);
