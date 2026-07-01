/** Repair UTF-8 Japanese text that was mis-read as Latin-1 (mojibake). */

const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;

export function hasJapanese(str: string): boolean {
  return JA_CHAR.test(str);
}

export function repairMojibakeUtf8(str: string): string {
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
