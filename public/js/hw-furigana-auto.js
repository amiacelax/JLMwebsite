/**
 * Auto hover-readings for homework sentences (kuromoji, lazy-loaded on first save/send).
 * Manual bracket notation in the maker always wins: 食べました[たべました]
 */
(function (global) {
  const KUROMOJI_SRC = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
  const KUROMOJI_DIC = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";
  const KANJI_RE = /[\u4e00-\u9fff々]/;

  let tokenizerPromise = null;

  function hasManualReadings(text) {
    if (global.HwWorksheet?.hasBracketRubyNotation) {
      return global.HwWorksheet.hasBracketRubyNotation(text);
    }
    return /([^\[\]]+?)\[([^\]]+)\]/.test(String(text || ""));
  }

  function parseManualSegments(text) {
    if (global.HwWorksheet?.parseBracketRubyNotation) {
      return global.HwWorksheet.parseBracketRubyNotation(text);
    }
    return [{ text: String(text || "") }];
  }

  function normalizeReading(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "");
  }

  function katakanaToHiragana(str) {
    return String(str || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  function loadKuromojiScript() {
    if (global.kuromoji) return Promise.resolve();
    const existing = document.querySelector('script[data-hw-kuromoji="1"]');
    if (existing) {
      return new Promise((resolve, reject) => {
        if (global.kuromoji) {
          resolve();
          return;
        }
        const finish = () => {
          if (global.kuromoji) resolve();
          else reject(new Error("kuromoji load failed"));
        };
        if (existing.readyState === "complete" || existing.readyState === "loaded") {
          finish();
          return;
        }
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("kuromoji load failed")), {
          once: true,
        });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = KUROMOJI_SRC;
      script.async = true;
      script.dataset.hwKuromoji = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("kuromoji load failed"));
      document.head.appendChild(script);
    });
  }

  /**
   * kuromoji joins dicPath with path.join, which turns "https://cdn…" into "https:/cdn…".
   * The browser then reads that as a path on OUR site and gets the home page back
   * ("invalid file signature"). Put the second slash back before the request goes out.
   */
  let kuromojiXhrFixed = false;
  function fixKuromojiXhrUrls() {
    if (kuromojiXhrFixed || typeof XMLHttpRequest === "undefined") return;
    kuromojiXhrFixed = true;
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      const raw = typeof url === "string" ? url : url && url.toString ? url.toString() : "";
      const at = raw.indexOf("cdn.jsdelivr.net/npm/kuromoji@");
      if (at >= 0 && !/^https:\/\/cdn\.jsdelivr\.net\//.test(raw)) {
        arguments[1] = "https://" + raw.slice(at);
      }
      return origOpen.apply(this, arguments);
    };
  }

  function ensureTokenizer() {
    if (tokenizerPromise) return tokenizerPromise;
    fixKuromojiXhrUrls();
    tokenizerPromise = loadKuromojiScript()
      .then(
        () =>
          new Promise((resolve, reject) => {
            if (!global.kuromoji?.builder) {
              reject(new Error("kuromoji unavailable"));
              return;
            }
            const timer = setTimeout(() => reject(new Error("tokenizer timeout")), 45000);
            global.kuromoji.builder({ dicPath: KUROMOJI_DIC }).build((err, tokenizer) => {
              clearTimeout(timer);
              if (err) reject(err);
              else resolve(tokenizer);
            });
          })
      )
      .catch((err) => {
        tokenizerPromise = null;
        throw err;
      });
    return tokenizerPromise;
  }

  function segmentsFromTokens(tokens) {
    const segments = [];
    (tokens || []).forEach((token) => {
      const surface = token.surface_form || "";
      if (!surface) return;
      const reading = katakanaToHiragana(token.reading || token.pronunciation || surface);
      const needsReading =
        KANJI_RE.test(surface) &&
        reading &&
        normalizeReading(reading) !== normalizeReading(surface);

      const addPlain = (str) => {
        if (!str) return;
        const last = segments[segments.length - 1];
        if (last && !last.rt) last.text += str;
        else segments.push({ text: str });
      };

      if (needsReading) {
        /* Okurigana stays plain: 越え -> 越(こ)え, not 越え(こえ). */
        let base = surface;
        let rt = reading;
        let tail = "";
        const kanaTail = surface.match(/[\u3040-\u309f]+$/);
        if (kanaTail && surface.length > kanaTail[0].length) {
          for (let n = kanaTail[0].length; n > 0; n--) {
            const t = kanaTail[0].slice(-n);
            if (reading.endsWith(t) && reading.length > t.length) {
              tail = t;
              base = surface.slice(0, surface.length - n);
              rt = reading.slice(0, reading.length - n);
              break;
            }
          }
        }
        segments.push({ text: base, rt });
        addPlain(tail);
        return;
      }

      addPlain(surface);
    });
    return segments;
  }

  function segmentsNeedReadings(segments) {
    return (segments || []).some((seg) => seg.rt);
  }

  async function textToRubySegments(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];

    if (hasManualReadings(raw)) {
      return parseManualSegments(raw);
    }

    if (!KANJI_RE.test(raw)) {
      return [{ text: raw }];
    }

    const tokenizer = await ensureTokenizer();
    return segmentsFromTokens(tokenizer.tokenize(raw));
  }

  async function annotateTextPart(part) {
    if (!part || part.type !== "text") return part;
    if (part.ruby?.length) return part;

    const value = String(part.value || "").trim();
    if (!value) return null;

    const segments = await textToRubySegments(value);
    if (!segments.length) return null;
    if (segments.length === 1 && !segments[0].rt) {
      return { type: "text", value: segments[0].text || value };
    }
    if (!segmentsNeedReadings(segments)) {
      return { type: "text", value };
    }
    return { type: "text", ruby: segments };
  }

  async function annotateAssignment(assignment) {
    if (!assignment) return assignment;

    const jobs = [];
    for (const section of assignment.sections || []) {
      if (section.mode !== "grammar-blank") continue;

      for (const item of section.items || []) {
        jobs.push(
          (async () => {
            const nextParts = await Promise.all(
              (item.parts || []).map(async (part) => {
                if (part.type !== "text") return part;
                const annotated = await annotateTextPart(part);
                return annotated || part;
              })
            );
            item.parts = nextParts;
          })()
        );
      }
    }

    await Promise.all(jobs);
    return assignment;
  }

  function assignmentNeedsAnnotation(assignment) {
    for (const section of assignment?.sections || []) {
      if (section.mode !== "grammar-blank") continue;
      for (const item of section.items || []) {
        for (const part of item.parts || []) {
          if (part.type !== "text" || part.ruby?.length) continue;
          const value = String(part.value || "").trim();
          if (!value) continue;
          if (hasManualReadings(value) || KANJI_RE.test(value)) return true;
        }
      }
    }
    return false;
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(label || "timeout")), ms);
      }),
    ]);
  }

  function preload() {
    void ensureTokenizer().catch(() => {});
  }

  global.HwFuriganaAuto = {
    annotateAssignment,
    assignmentNeedsAnnotation,
    textToRubySegments,
    hasManualReadings,
    withTimeout,
    preload,
    ensureTokenizer,
  };
})(window);
