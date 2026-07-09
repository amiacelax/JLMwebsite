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
export function repairMojibakeUtf8(str: string): string {
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
