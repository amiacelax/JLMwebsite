/** Repair UTF-8 Japanese text that was mis-read as Latin-1 (mojibake). */

const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
const JA_PUNCT = /[。、「」『』（）・…〜～]/;
const LATIN1_HIGH = /[\u0080-\u00ff]/;
const LATIN1_HIGH_RUN = /[\u0080-\u00ff]+/g;

export function hasJapanese(str: string): boolean {
  return JA_CHAR.test(str);
}

function looksRepaired(str: string): boolean {
  return hasJapanese(str) || JA_PUNCT.test(str);
}

function decodeLatin1BytesAsUtf8(run: string, fatal = false): string | null {
  try {
    const bytes = Uint8Array.from([...run].map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Fix Latin-1 mojibake, including mixed strings that already contain Japanese
 * (e.g. 「行きたいã」 where only the 。 was corrupted).
 */
function repairLatin1Mojibake(str: string): string {
  const value = String(str || "");
  if (!value || !LATIN1_HIGH.test(value)) return value;

  // Pure / mostly Latin-1 mangled payload — decode the whole string.
  if (!hasJapanese(value)) {
    const repaired = decodeLatin1BytesAsUtf8(value, false);
    if (repaired && looksRepaired(repaired) && repaired !== value) return repaired;
    return value;
  }

  // Mixed JP + mojibake: only re-decode contiguous high-byte runs.
  return value.replace(LATIN1_HIGH_RUN, (run) => {
    const repaired = decodeLatin1BytesAsUtf8(run, true);
    if (repaired && looksRepaired(repaired)) return repaired;
    const soft = decodeLatin1BytesAsUtf8(run, false);
    if (soft && looksRepaired(soft) && soft !== run) return soft;
    return run;
  });
}

export function repairAssignmentRecord(
  assignment: Record<string, unknown>
): { assignment: Record<string, unknown>; repaired: boolean } {
  let repaired = false;

  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      const fixed = repairMojibakeUtf8(value);
      if (fixed !== value) repaired = true;
      return fixed;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = walk(child);
      }
      return out;
    }
    return value;
  }

  return { assignment: walk(assignment) as Record<string, unknown>, repaired };
}

/* ------------------------------------------------------------------------------------------------
 * "Baked language" guard.
 * Japanese that was saved after being read with the wrong code page looks like
 *   ãŠåå‰ (Windows-1252)   or   πüèσÉìσëìπü» (old DOS console, code page 437).
 * These tables undo that: every character is turned back into the byte it came from, then the bytes
 * are read as UTF-8. If they are not valid UTF-8 the text was not mojibake and is left alone.
 * ---------------------------------------------------------------------------------------------- */
const CP437_HIGH = "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0";
const CP1252_HIGH = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff";

function byteMap(high: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < high.length; i++) m.set(high[i], 0x80 + i);
  return m;
}
const CP437_MAP = byteMap(CP437_HIGH);
const CP1252_MAP = byteMap(CP1252_HIGH);

/** Re-read every run of "wrong code page" characters as UTF-8. Plain ASCII is left alone. */
function repairWithTable(str: string, map: Map<string, number>): string {
  let out = "";
  let run: number[] = [];
  let runText = "";
  const flush = () => {
    if (!run.length) return;
    let fixed: string | null = null;
    try {
      fixed = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(run));
    } catch {
      fixed = null;
    }
    out += fixed && fixed !== runText ? fixed : runText;
    run = [];
    runText = "";
  };
  for (const ch of str) {
    const b = map.get(ch);
    if (b !== undefined) {
      run.push(b);
      runText += ch;
    } else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

/** Undo every kind of mojibake we know (Latin-1, Windows-1252, DOS code page 437). */
export function repairMojibakeUtf8(str: string): string {
  let value = String(str || "");
  if (!value) return value;
  value = repairLatin1Mojibake(value);
  value = repairWithTable(value, CP1252_MAP);
  value = repairWithTable(value, CP437_MAP);
  return value;
}

export function hasMojibake(str: string): boolean {
  const value = String(str || "");
  return !!value && repairMojibakeUtf8(value) !== value;
}

/** Repair every string inside any JSON-like value. */
export function repairDeep<T>(value: T): { value: T; repaired: number } {
  let repaired = 0;
  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      const fixed = repairMojibakeUtf8(v);
      if (fixed !== v) repaired++;
      return fixed;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) out[k] = walk(child);
      return out;
    }
    return v;
  }
  return { value: walk(value) as T, repaired };
}

/** KV keys that hold media / binary-ish payloads (never touched). */
const SKIP_KEY = /^(media|hw-m|subvid|submission-video|submission-photo|submission-audio|video|audio|photo|img|blob):/i;

/** Binary data read back as text (video, audio, images): never touch it. */
export function looksBinary(text: string): boolean {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return true;
  const broken = (text.match(/\ufffd/g) || []).length;
  return broken >= 20 && broken / text.length > 0.05;
}

/**
 * Wrap a KV namespace so nothing with baked language can be saved: text that is mojibake is repaired
 * on the way in (and logged). Reads and everything else pass straight through.
 */
export function guardKv(kv: KVNamespace): KVNamespace {
  return new Proxy(kv, {
    get(target, prop, receiver) {
      if (prop === "put") {
        return async (key: string, value: unknown, options?: unknown) => {
          let next = value;
          if (typeof value === "string" && value.length < 2_000_000 && !SKIP_KEY.test(key) && !looksBinary(value)) {
            try {
              const trimmed = value.trimStart();
              if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                const { value: fixed, repaired } = repairDeep(JSON.parse(value));
                if (repaired) {
                  console.warn("baked-language guard: repaired " + repaired + " string(s) before saving " + key);
                  next = JSON.stringify(fixed);
                }
              } else {
                const fixed = repairMojibakeUtf8(value);
                if (fixed !== value) {
                  console.warn("baked-language guard: repaired text before saving " + key);
                  next = fixed;
                }
              }
            } catch {
              /* not JSON / not text we can fix - save as given */
            }
          }
          return (target as unknown as { put: (...a: unknown[]) => Promise<void> }).put(key, next, options);
        };
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as KVNamespace;
}

/** Same Worker env, but HOMEWORK_KV is the guarded one. */
export function guardEnv<E extends { HOMEWORK_KV?: KVNamespace }>(env: E): E {
  if (!env.HOMEWORK_KV) return env;
  const guarded = guardKv(env.HOMEWORK_KV);
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === "HOMEWORK_KV") return guarded;
      return Reflect.get(target, prop, receiver);
    },
  });
}
