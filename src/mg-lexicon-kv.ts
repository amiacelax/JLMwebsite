/** Global magnifying-glass lexicon (KV) — one rulebook for all users. */

import type { KvEnv } from "./homework-kv";

const OVERLAY_KEY = "site:mg-lexicon-overlay";
const QUEUE_KEY = "site:mg-lexicon-queue";
const TEACHER_DEFAULT = "jlm";

export type MgLexiconCardKind = "custom" | "merge" | "skip" | "force_unit" | "lemma";

export interface MgLexiconCustomEntry {
  reading: string;
  definition: string;
}

export interface MgLexiconMergeSequence {
  surfaces: string[];
}

export interface MgLexiconGlobalOverlay {
  custom: Record<string, MgLexiconCustomEntry>;
  mergeSurfaceSequences: MgLexiconMergeSequence[];
  skipSurface: string[];
  forceUnits: string[];
  lemmaQuery: Record<string, string>;
  updatedAt: string;
}

export interface MgLexiconQueueCard {
  id: string;
  surface: string;
  kind: MgLexiconCardKind;
  title: string;
  note?: string;
  example?: string;
  fingerprint?: string;
  sourceWorksheetId?: string;
  sourceWorksheetTitle?: string;
  draft?: {
    reading?: string;
    definition?: string;
    mergeSurfaces?: string[];
    skipSurface?: string;
    forceUnit?: string;
    lemmaSurface?: string;
    lemmaQuery?: string;
  };
  status: "pending" | "done";
  createdAt: string;
  resolvedAt?: string;
}

export interface MgLexiconSubmitPayload {
  teacherUsername?: string;
  cardId: string;
  kind: MgLexiconCardKind;
  surface: string;
  reading?: string;
  definition?: string;
  mergeSurfaces?: string[];
  skipSurface?: string;
  forceUnit?: string;
  lemmaSurface?: string;
  lemmaQuery?: string;
}

export interface MgLexiconAddCardPayload {
  teacherUsername?: string;
  surface: string;
  kind?: MgLexiconCardKind;
  title?: string;
  note?: string;
  example?: string;
}

export interface MgLexiconSuggestItem {
  fingerprint: string;
  surface: string;
  kind: MgLexiconCardKind;
  title: string;
  note?: string;
  example?: string;
  draft?: MgLexiconQueueCard["draft"];
}

export interface MgLexiconSuggestBatchPayload {
  teacherUsername?: string;
  worksheetId?: string;
  worksheetTitle?: string;
  items?: MgLexiconSuggestItem[];
}

function isTeacher(username: string | undefined, env: KvEnv): boolean {
  const allowed = (env.HW_TEACHER_USER || TEACHER_DEFAULT).toLowerCase();
  return (
    String(username || "")
      .trim()
      .toLowerCase() === allowed
  );
}

function emptyOverlay(): MgLexiconGlobalOverlay {
  return {
    custom: {},
    mergeSurfaceSequences: [],
    skipSurface: [],
    forceUnits: [],
    lemmaQuery: {},
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeOverlay(raw: unknown): MgLexiconGlobalOverlay {
  const base = emptyOverlay();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<MgLexiconGlobalOverlay>;

  if (data.custom && typeof data.custom === "object") {
    for (const [key, val] of Object.entries(data.custom)) {
      const surface = String(key || "").trim();
      if (!surface || !val || typeof val !== "object") continue;
      const reading = String((val as MgLexiconCustomEntry).reading || "").trim();
      const definition = String((val as MgLexiconCustomEntry).definition || "").trim();
      if (!reading && !definition) continue;
      base.custom[surface] = { reading, definition };
    }
  }

  if (Array.isArray(data.mergeSurfaceSequences)) {
    for (const item of data.mergeSurfaceSequences) {
      if (!item || !Array.isArray(item.surfaces)) continue;
      const surfaces = item.surfaces.map((s) => String(s || "").trim()).filter(Boolean);
      if (surfaces.length >= 2) base.mergeSurfaceSequences.push({ surfaces });
    }
  }

  if (Array.isArray(data.skipSurface)) {
    base.skipSurface = [...new Set(data.skipSurface.map((s) => String(s || "").trim()).filter(Boolean))];
  }

  if (Array.isArray(data.forceUnits)) {
    base.forceUnits = [...new Set(data.forceUnits.map((s) => String(s || "").trim()).filter(Boolean))];
  }

  if (data.lemmaQuery && typeof data.lemmaQuery === "object") {
    for (const [key, val] of Object.entries(data.lemmaQuery)) {
      const surface = String(key || "").trim();
      const query = String(val || "").trim();
      if (surface && query) base.lemmaQuery[surface] = query;
    }
  }

  if (typeof data.updatedAt === "string") base.updatedAt = data.updatedAt;
  return base;
}

function seedQueue(): MgLexiconQueueCard[] {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-nakanaka",
      surface: "中々",
      kind: "custom",
      title: "中々 — keep whole + gloss",
      note: "Should never split into single 中. Reading なかなか.",
      example: "今日は中々難しいですね。",
      draft: {
        reading: "なかなか",
        definition: "quite; considerably; not easily",
        forceUnit: "中々",
      },
      status: "pending",
      createdAt: now,
    },
    {
      id: "seed-yametai",
      surface: "やめたい",
      kind: "merge",
      title: "やめたい — stem + たい",
      note: "Want-to quit pattern: lookup meaningful chunk, not random kanji split.",
      example: "仕事をやめたい。",
      draft: { mergeSurfaces: ["やめ", "たい"] },
      status: "pending",
      createdAt: now,
    },
    {
      id: "seed-yamemasu",
      surface: "やめます",
      kind: "lemma",
      title: "やめます — polite verb",
      note: "Polite present: dictionary headword やめる + ます (skip ます globally).",
      example: "タバコをやめます。",
      draft: { lemmaSurface: "やめ", lemmaQuery: "やめる" },
      status: "pending",
      createdAt: now,
    },
    {
      id: "seed-tai",
      surface: "たい",
      kind: "custom",
      title: "たい — want auxiliary",
      example: "行きたい。",
      draft: { reading: "たい", definition: "want (～たい)" },
      status: "pending",
      createdAt: now,
    },
    {
      id: "seed-kedo",
      surface: "けど",
      kind: "custom",
      title: "けど — but",
      example: "行きたいけど、時間がない。",
      draft: { reading: "けど", definition: "but; though" },
      status: "pending",
      createdAt: now,
    },
    {
      id: "seed-wa-particle",
      surface: "は",
      kind: "skip",
      title: "は — never lookup particle",
      note: "Particles should never highlight. Students ask in notes/chat if curious.",
      example: "私は学生です。",
      draft: { skipSurface: "は" },
      status: "pending",
      createdAt: now,
    },
  ];
}

async function readOverlay(kv: KVNamespace): Promise<MgLexiconGlobalOverlay> {
  const raw = await kv.get(OVERLAY_KEY);
  if (!raw) return emptyOverlay();
  try {
    return sanitizeOverlay(JSON.parse(raw));
  } catch {
    return emptyOverlay();
  }
}

async function writeOverlay(kv: KVNamespace, overlay: MgLexiconGlobalOverlay): Promise<void> {
  overlay.updatedAt = new Date().toISOString();
  await kv.put(OVERLAY_KEY, JSON.stringify(overlay));
}

async function readQueue(kv: KVNamespace): Promise<MgLexiconQueueCard[]> {
  const raw = await kv.get(QUEUE_KEY);
  if (!raw) return seedQueue();
  try {
    const parsed = JSON.parse(raw) as MgLexiconQueueCard[];
    if (!Array.isArray(parsed) || !parsed.length) return seedQueue();
    return parsed;
  } catch {
    return seedQueue();
  }
}

async function writeQueue(kv: KVNamespace, cards: MgLexiconQueueCard[]): Promise<void> {
  await kv.put(QUEUE_KEY, JSON.stringify(cards));
}

function mergeSequenceExists(overlay: MgLexiconGlobalOverlay, surfaces: string[]): boolean {
  const key = surfaces.join("|");
  return overlay.mergeSurfaceSequences.some((seq) => seq.surfaces.join("|") === key);
}

function applySubmitToOverlay(
  overlay: MgLexiconGlobalOverlay,
  payload: MgLexiconSubmitPayload
): void {
  const surface = String(payload.surface || "").trim();
  if (!surface) throw new Error("SURFACE_REQUIRED");

  switch (payload.kind) {
    case "custom": {
      const reading = String(payload.reading || "").trim();
      const definition = String(payload.definition || "").trim();
      if (!reading && !definition) throw new Error("CUSTOM_REQUIRED");
      overlay.custom[surface] = { reading, definition };
      const force = String(payload.forceUnit || "").trim();
      if (force && !overlay.forceUnits.includes(force)) overlay.forceUnits.push(force);
      break;
    }
    case "merge": {
      const surfaces = (payload.mergeSurfaces || [])
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      if (surfaces.length < 2) throw new Error("MERGE_REQUIRED");
      if (!mergeSequenceExists(overlay, surfaces)) {
        overlay.mergeSurfaceSequences.push({ surfaces });
      }
      break;
    }
    case "skip": {
      const skip = String(payload.skipSurface || payload.surface || "").trim();
      if (!skip) throw new Error("SKIP_REQUIRED");
      if (!overlay.skipSurface.includes(skip)) overlay.skipSurface.push(skip);
      break;
    }
    case "force_unit": {
      const unit = String(payload.forceUnit || payload.surface || "").trim();
      if (!unit) throw new Error("FORCE_REQUIRED");
      if (!overlay.forceUnits.includes(unit)) overlay.forceUnits.push(unit);
      break;
    }
    case "lemma": {
      const lemmaSurface = String(payload.lemmaSurface || payload.surface || "").trim();
      const lemmaQuery = String(payload.lemmaQuery || "").trim();
      if (!lemmaSurface || !lemmaQuery) throw new Error("LEMMA_REQUIRED");
      overlay.lemmaQuery[lemmaSurface] = lemmaQuery;
      break;
    }
    default:
      throw new Error("INVALID_KIND");
  }
}

export async function getMgLexiconPublic(env: KvEnv): Promise<{
  overlay: MgLexiconGlobalOverlay;
  version: string;
}> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const overlay = await readOverlay(kv);
  return { overlay, version: overlay.updatedAt };
}

export async function getMgLexiconQueue(
  data: { teacherUsername?: string },
  env: KvEnv
): Promise<{ pending: MgLexiconQueueCard[]; doneCount: number; overlayVersion: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const cards = await readQueue(kv);
  const pending = cards.filter((c) => c.status === "pending");
  const doneCount = cards.filter((c) => c.status === "done").length;
  const overlay = await readOverlay(kv);
  return { pending, doneCount, overlayVersion: overlay.updatedAt };
}

export async function submitMgLexiconCard(
  data: MgLexiconSubmitPayload,
  env: KvEnv
): Promise<{ overlay: MgLexiconGlobalOverlay; remaining: number }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const cardId = String(data.cardId || "").trim();
  if (!cardId) throw new Error("CARD_REQUIRED");

  const cards = await readQueue(kv);
  const index = cards.findIndex((c) => c.id === cardId && c.status === "pending");
  if (index < 0) throw new Error("CARD_NOT_FOUND");

  const overlay = await readOverlay(kv);
  applySubmitToOverlay(overlay, data);
  await writeOverlay(kv, overlay);

  cards[index] = {
    ...cards[index],
    status: "done",
    resolvedAt: new Date().toISOString(),
  };
  await writeQueue(kv, cards);

  const remaining = cards.filter((c) => c.status === "pending").length;
  return { overlay, remaining };
}

export async function addMgLexiconCard(
  data: MgLexiconAddCardPayload,
  env: KvEnv
): Promise<{ card: MgLexiconQueueCard; pending: number }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const surface = String(data.surface || "").trim();
  if (!surface) throw new Error("SURFACE_REQUIRED");

  const kind = (data.kind || "custom") as MgLexiconCardKind;
  const cards = await readQueue(kv);
  const id = "card-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const card: MgLexiconQueueCard = {
    id,
    surface,
    kind,
    title: String(data.title || "").trim() || "Review: " + surface,
    note: String(data.note || "").trim() || undefined,
    example: String(data.example || "").trim() || surface,
    draft: {},
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  cards.unshift(card);
  await writeQueue(kv, cards);
  return { card, pending: cards.filter((c) => c.status === "pending").length };
}

function overlayCoversItem(
  item: MgLexiconSuggestItem,
  overlay: MgLexiconGlobalOverlay
): boolean {
  const surface = String(item.surface || "").trim();
  if (!surface) return true;

  if (item.kind === "custom" && overlay.custom[surface]) return true;
  if (item.kind === "skip" && overlay.skipSurface.includes(surface)) return true;
  if (item.kind === "force_unit" && overlay.forceUnits.includes(surface)) return true;

  if (item.kind === "lemma") {
    const stem = String(item.draft?.lemmaSurface || surface).trim();
    if (stem && overlay.lemmaQuery[stem]) return true;
  }

  if (item.kind === "merge") {
    const surfaces = (item.draft?.mergeSurfaces || [])
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (surfaces.length >= 2) {
      const key = surfaces.join("|");
      if (overlay.mergeSurfaceSequences.some((seq) => seq.surfaces.join("|") === key)) {
        return true;
      }
    }
  }

  if (overlay.forceUnits.includes(surface)) return true;
  if (overlay.custom[surface]) return true;

  return false;
}

export async function suggestMgLexiconBatch(
  data: MgLexiconSuggestBatchPayload,
  env: KvEnv
): Promise<{ added: number; skipped: number; pending: number }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return { added: 0, skipped: 0, pending: 0 };

  const overlay = await readOverlay(kv);
  const cards = await readQueue(kv);
  const knownFingerprints = new Set(
    cards.map((c) => String(c.fingerprint || "").trim()).filter(Boolean)
  );
  const pendingSurfaces = new Set(
    cards.filter((c) => c.status === "pending").map((c) => c.surface)
  );

  let added = 0;
  let skipped = 0;
  const worksheetId = String(data.worksheetId || "").trim();
  const worksheetTitle = String(data.worksheetTitle || "").trim();

  for (const rawItem of items) {
    const fingerprint = String(rawItem.fingerprint || "").trim();
    const surface = String(rawItem.surface || "").trim();
    if (!fingerprint || !surface) {
      skipped += 1;
      continue;
    }
    if (knownFingerprints.has(fingerprint)) {
      skipped += 1;
      continue;
    }
    if (overlayCoversItem(rawItem, overlay)) {
      skipped += 1;
      continue;
    }
    if (pendingSurfaces.has(surface) && rawItem.kind !== "merge") {
      skipped += 1;
      continue;
    }

    const id = "card-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const card: MgLexiconQueueCard = {
      id,
      surface,
      kind: rawItem.kind,
      title: String(rawItem.title || "").trim() || "Review: " + surface,
      note: String(rawItem.note || "").trim() || undefined,
      example: String(rawItem.example || "").trim() || surface,
      fingerprint,
      sourceWorksheetId: worksheetId || undefined,
      sourceWorksheetTitle: worksheetTitle || undefined,
      draft: rawItem.draft || {},
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    cards.unshift(card);
    knownFingerprints.add(fingerprint);
    pendingSurfaces.add(surface);
    added += 1;
  }

  if (added) await writeQueue(kv, cards);
  const pending = cards.filter((c) => c.status === "pending").length;
  return { added, skipped, pending };
}
