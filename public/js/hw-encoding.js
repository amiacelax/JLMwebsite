/**
 * Repair UTF-8 Japanese text mis-read as Latin-1 (mojibake in older KV saves).
 */
(function (global) {
  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;

  function hasJapanese(str) {
    return JA_CHAR.test(String(str || ""));
  }

  function repairMojibakeUtf8(str) {
    const value = String(str || "");
    if (!value || hasJapanese(value)) return value;
    if (!/[\u0080-\u00ff]/.test(value)) return value;
    try {
      const bytes = Uint8Array.from([...value].map((ch) => ch.charCodeAt(0) & 0xff));
      const repaired = new TextDecoder("utf-8").decode(bytes);
      if (hasJapanese(repaired)) return repaired;
    } catch {
      /* keep original */
    }
    return value;
  }

  function repairAssignment(assignment) {
    if (!assignment || typeof assignment !== "object") return assignment;
    let repaired = false;

    function walk(value) {
      if (typeof value === "string") {
        const fixed = repairMojibakeUtf8(value);
        if (fixed !== value) repaired = true;
        return fixed;
      }
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

    const next = walk(assignment);
    return next;
  }

  global.HwEncoding = {
    hasJapanese,
    repairMojibakeUtf8,
    repairAssignment,
  };
})(window);
