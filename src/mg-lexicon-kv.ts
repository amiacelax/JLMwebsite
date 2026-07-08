/** Global magnifying-glass lexicon (KV) — one rulebook for all users. */

import type { KvEnv } from "./homework-kv";

const OVERLAY_KEY = "site:mg-lexicon-overlay";
const QUEUE_KEY = "site:mg-lexicon-queue";
const TEACHER_DEFAULT = "jlm";

export type MgLexiconCardKind = "custom" | "merge" | "split" | "skip" | "force_unit" | "lemma";

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
  segmentSurfaceSequences: MgLexiconMergeSequence[];
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
    splitSurfaces?: string[];
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
  splitSurfaces?: string[];
  skipSurface?: string;
  forceUnit?: string;
  lemmaSurface?: string;
  lemmaQuery?: string;
  extraLemmaQuery?: Record<string, string>;
  extraCustom?: Record<string, MgLexiconCustomEntry>;
}

export interface MgLexiconAddCardPayload {
  teacherUsername?: string;
  surface: string;
  kind?: MgLexiconCardKind;
  title?: string;
  note?: string;
  example?: string;
}

/** Inline teacher edit from magnifying-glass popup — no queue card required. */
export interface MgLexiconPatchPayload {
  teacherUsername?: string;
  surface: string;
  reading?: string;
  definition?: string;
  mergeSurfaces?: string[];
  splitSurfaces?: string[];
  skipSurface?: string;
  forceUnit?: string;
  lemmaSurface?: string;
  lemmaQuery?: string;
  extraLemmaQuery?: Record<string, string>;
  extraCustom?: Record<string, MgLexiconCustomEntry>;
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
    segmentSurfaceSequences: [],
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

  if (Array.isArray(data.segmentSurfaceSequences)) {
    for (const item of data.segmentSurfaceSequences) {
      if (!item || !Array.isArray(item.surfaces)) continue;
      const surfaces = item.surfaces.map((s) => String(s || "").trim()).filter(Boolean);
      if (surfaces.length >= 2) base.segmentSurfaceSequences.push({ surfaces });
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
      kind: "split",
      title: "やめたい — stem + たい",
      note: "Click やめ and たい separately — each gets its own lookup.",
      example: "仕事をやめたい。",
      draft: { splitSurfaces: ["やめ", "たい"] },
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

function normalizeQueueCard(card: MgLexiconQueueCard): MgLexiconQueueCard {
  if (card.id === "seed-yametai" && card.kind === "merge") {
    const mergePieces = card.draft?.mergeSurfaces || ["やめ", "たい"];
    return {
      ...card,
      kind: "split",
      note: "Click やめ and たい separately — each gets its own lookup.",
      draft: { ...card.draft, splitSurfaces: mergePieces },
    };
  }
  return card;
}

async function readQueue(kv: KVNamespace): Promise<MgLexiconQueueCard[]> {
  const raw = await kv.get(QUEUE_KEY);
  if (!raw) return seedQueue();
  try {
    const parsed = JSON.parse(raw) as MgLexiconQueueCard[];
    if (!Array.isArray(parsed) || !parsed.length) return seedQueue();
    return parsed.map(normalizeQueueCard);
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

function segmentSequenceExists(overlay: MgLexiconGlobalOverlay, surfaces: string[]): boolean {
  const key = surfaces.join("|");
  return overlay.segmentSurfaceSequences.some((seq) => seq.surfaces.join("|") === key);
}

function removeMergeSequence(overlay: MgLexiconGlobalOverlay, surfaces: string[]): void {
  const key = surfaces.join("|");
  overlay.mergeSurfaceSequences = overlay.mergeSurfaceSequences.filter(
    (seq) => seq.surfaces.join("|") !== key
  );
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
    case "split": {
      const surfaces = (payload.splitSurfaces || [])
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      if (surfaces.length < 2) throw new Error("SPLIT_REQUIRED");
      removeMergeSequence(overlay, surfaces);
      if (!segmentSequenceExists(overlay, surfaces)) {
        overlay.segmentSurfaceSequences.push({ surfaces });
      }
      break;
    }
    case "skip": {
      const skip = String(payload.skipSurface || payload.surface || "").trim();
      if (!skip) throw new Error("SKIP_REQUIRED");
      if (!overlay.skipSurface.includes(skip)) overlay.skipSurface.push(skip);
      overlay.forceUnits = overlay.forceUnits.filter((unit) => unit !== skip);
      delete overlay.custom[skip];
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

  const splitSurfaces = (payload.splitSurfaces || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  if (splitSurfaces.length >= 2) {
    removeMergeSequence(overlay, splitSurfaces);
    if (!segmentSequenceExists(overlay, splitSurfaces)) {
      overlay.segmentSurfaceSequences.push({ surfaces: splitSurfaces });
    }
  }

  if (payload.extraLemmaQuery && typeof payload.extraLemmaQuery === "object") {
    for (const [key, val] of Object.entries(payload.extraLemmaQuery)) {
      const lemmaSurface = String(key || "").trim();
      const lemmaQuery = String(val || "").trim();
      if (lemmaSurface && lemmaQuery) overlay.lemmaQuery[lemmaSurface] = lemmaQuery;
    }
  }

  if (payload.extraCustom && typeof payload.extraCustom === "object") {
    for (const [key, val] of Object.entries(payload.extraCustom)) {
      const word = String(key || "").trim();
      if (!word || !val || typeof val !== "object") continue;
      const reading = String(val.reading || "").trim();
      const definition = String(val.definition || "").trim();
      if (!reading && !definition) continue;
      overlay.custom[word] = { reading, definition };
    }
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

  const [cards, overlay] = await Promise.all([readQueue(kv), readOverlay(kv)]);
  const index = cards.findIndex((c) => c.id === cardId && c.status === "pending");
  if (index < 0) throw new Error("CARD_NOT_FOUND");

  applySubmitToOverlay(overlay, data);

  cards[index] = {
    ...cards[index],
    status: "done",
    resolvedAt: new Date().toISOString(),
  };
  await Promise.all([writeOverlay(kv, overlay), writeQueue(kv, cards)]);

  const remaining = cards.filter((c) => c.status === "pending").length;
  return { overlay, remaining };
}

export async function patchMgLexiconOverlay(
  data: MgLexiconPatchPayload,
  env: KvEnv
): Promise<{ overlay: MgLexiconGlobalOverlay }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const surface = String(data.surface || "").trim();
  if (!surface) throw new Error("SURFACE_REQUIRED");

  const overlay = await readOverlay(kv);
  const reading = String(data.reading || "").trim();
  const definition = String(data.definition || "").trim();
  const splitSurfaces = (data.splitSurfaces || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const mergeSurfaces = (data.mergeSurfaces || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const forceUnit = String(data.forceUnit || "").trim();
  const skipSurface = String(data.skipSurface || "").trim();

  if (reading || definition) {
    overlay.custom[surface] = { reading, definition };
  }

  if (mergeSurfaces.length >= 2) {
    if (!mergeSequenceExists(overlay, mergeSurfaces)) {
      overlay.mergeSurfaceSequences.push({ surfaces: mergeSurfaces });
    }
  }

  if (splitSurfaces.length >= 2) {
    removeMergeSequence(overlay, splitSurfaces);
    if (!segmentSequenceExists(overlay, splitSurfaces)) {
      overlay.segmentSurfaceSequences.push({ surfaces: splitSurfaces });
    }
  }

  if (forceUnit && !overlay.forceUnits.includes(forceUnit)) {
    overlay.forceUnits.push(forceUnit);
  }

  if (skipSurface) {
    if (!overlay.skipSurface.includes(skipSurface)) overlay.skipSurface.push(skipSurface);
    overlay.forceUnits = overlay.forceUnits.filter((unit) => unit !== skipSurface);
    delete overlay.custom[skipSurface];
  }

  const lemmaSurface = String(data.lemmaSurface || "").trim();
  const lemmaQuery = String(data.lemmaQuery || "").trim();
  if (lemmaSurface && lemmaQuery) {
    overlay.lemmaQuery[lemmaSurface] = lemmaQuery;
  }

  if (data.extraLemmaQuery && typeof data.extraLemmaQuery === "object") {
    for (const [key, val] of Object.entries(data.extraLemmaQuery)) {
      const stem = String(key || "").trim();
      const query = String(val || "").trim();
      if (stem && query) overlay.lemmaQuery[stem] = query;
    }
  }

  if (data.extraCustom && typeof data.extraCustom === "object") {
    for (const [key, val] of Object.entries(data.extraCustom)) {
      const word = String(key || "").trim();
      if (!word || !val || typeof val !== "object") continue;
      const r = String(val.reading || "").trim();
      const d = String(val.definition || "").trim();
      if (!r && !d) continue;
      overlay.custom[word] = { reading: r, definition: d };
    }
  }

  if (
    !reading &&
    !definition &&
    mergeSurfaces.length < 2 &&
    splitSurfaces.length < 2 &&
    !forceUnit &&
    !skipSurface &&
    !(lemmaSurface && lemmaQuery) &&
    !Object.keys(data.extraCustom || {}).length &&
    !Object.keys(data.extraLemmaQuery || {}).length
  ) {
    throw new Error("PATCH_EMPTY");
  }

  await writeOverlay(kv, overlay);
  return { overlay };
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

/** Mirrors built-in entries in public/js/hw-mg-lexicon.js — skip re-queuing these. */
const BASELINE_CUSTOM_SURFACES = new Set([
  "仕事",
  "やめたい",
  "たい",
  "けど",
  "中々",
  "だった",
  "でした",
  "なかった",
  "じゃなかった",
  "ではなかった",
]);

const BASELINE_LEMMA_SURFACES = new Set(["行き", "やめ", "やめたい"]);

const BASELINE_SKIP_SURFACES = new Set([
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

const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
const JA_RUN = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]+/g;
/** Auto-queue word-sized chunks only — longer runs are usually whole prompts/sentences. */
const MAX_AUTO_SURFACE_LEN = 10;

function hasJapanese(str: string): boolean {
  return JA_CHAR.test(str);
}

/** UTF-8 bytes mis-read as Latin-1 (common in some save paths). */
function repairMojibakeUtf8(str: string): string {
  const value = String(str || "");
  if (!value || hasJapanese(value)) return value;
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map((ch) => ch.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (hasJapanese(repaired)) return repaired;
  } catch {
    /* keep original */
  }
  return value;
}

function normalizeJapaneseInput(str: unknown): string {
  return repairMojibakeUtf8(String(str || "").trim());
}

function isBaselineCovered(surface: string): boolean {
  return (
    BASELINE_CUSTOM_SURFACES.has(surface) ||
    BASELINE_LEMMA_SURFACES.has(surface) ||
    BASELINE_SKIP_SURFACES.has(surface)
  );
}

function grammarItemSentence(item: Record<string, unknown>): string {
  let out = "";
  const parts = Array.isArray(item.parts) ? item.parts : [];
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Record<string, unknown>;
    if (part.type === "text") {
      const ruby = Array.isArray(part.ruby) ? part.ruby : [];
      if (ruby.length) {
        out += ruby
          .map((r) => {
            if (!r || typeof r !== "object") return "";
            const seg = r as Record<string, unknown>;
            return String(seg.text || seg.base || "");
          })
          .join("");
      } else {
        out += String(part.value || "");
      }
    } else if (part.type === "blank") {
      const hint = part.hint && typeof part.hint === "object" ? (part.hint as Record<string, unknown>) : null;
      out += String(part.answer || hint?.dictionary || "");
    }
  }
  return out.trim();
}

function pushJapaneseText(list: string[], str: unknown): void {
  const value = normalizeJapaneseInput(str);
  if (!value || !hasJapanese(value)) return;
  list.push(value);
}

function starOrderTexts(item: Record<string, unknown>): string[] {
  const texts: string[] = [];
  const tokens = Array.isArray(item.tokens) ? item.tokens : [];
  if (tokens.length) {
    const joined = tokens
      .map((t) => {
        if (!t || typeof t !== "object") return "";
        return String((t as Record<string, unknown>).text || "");
      })
      .join("");
    pushJapaneseText(texts, joined);
    for (const raw of tokens) {
      if (!raw || typeof raw !== "object") continue;
      pushJapaneseText(texts, String((raw as Record<string, unknown>).text || ""));
    }
    return texts;
  }
  pushJapaneseText(texts, item.prefix);
  pushJapaneseText(texts, item.suffix);
  const pieces = Array.isArray(item.pieces) ? item.pieces : [];
  for (const piece of pieces) pushJapaneseText(texts, piece);
  const legacy =
    String(item.prefix || "") + pieces.map((p) => String(p || "")).join("") + String(item.suffix || "");
  pushJapaneseText(texts, legacy);
  return texts;
}

export function extractJapaneseTextsFromAssignment(assignment: Record<string, unknown>): string[] {
  const texts: string[] = [];
  const sections = Array.isArray(assignment.sections) ? assignment.sections : [];
  for (const rawSection of sections) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const section = rawSection as Record<string, unknown>;
    const mode = String(section.mode || "");
    pushJapaneseText(texts, section.title);
    pushJapaneseText(texts, section.instructions);

    const items = Array.isArray(section.items) ? section.items : [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;

      if (mode === "grammar-blank") {
        pushJapaneseText(texts, grammarItemSentence(item));
        continue;
      }
      if (mode === "translation") {
        pushJapaneseText(texts, item.japanese);
        continue;
      }
      if (mode === "star-order") {
        starOrderTexts(item).forEach((t) => texts.push(t));
        continue;
      }
      if (mode === "context-blank") {
        pushJapaneseText(texts, item.topic);
        const parts = Array.isArray(item.parts) ? item.parts : [];
        for (const rawPart of parts) {
          if (!rawPart || typeof rawPart !== "object") continue;
          const part = rawPart as Record<string, unknown>;
          if (part.type === "text") pushJapaneseText(texts, part.value);
        }
        continue;
      }
      if (mode === "audio-listening") {
        const parts = Array.isArray(item.parts) ? item.parts : [];
        for (const rawPart of parts) {
          if (!rawPart || typeof rawPart !== "object") continue;
          const part = rawPart as Record<string, unknown>;
          if (part.type === "blank") pushJapaneseText(texts, part.answer);
        }
        pushJapaneseText(texts, item.japanese);
        continue;
      }
      if (mode === "video-response") {
        pushJapaneseText(texts, item.prompt);
        continue;
      }
      if (mode === "audio-prompt") {
        pushJapaneseText(texts, item.prompt);
      }
    }
  }
  return texts;
}

function isSuggestableSurface(surface: string, fromToken = false): boolean {
  if (!surface || !hasJapanese(surface)) return false;
  if (BASELINE_SKIP_SURFACES.has(surface)) return false;
  if (surface.length === 1 && /[\u3040-\u309f\u30a0-\u30ff]/.test(surface)) return false;
  if (!fromToken && surface.length > MAX_AUTO_SURFACE_LEN) return false;
  return true;
}

function collectSurfacesFromAssignment(assignment: Record<string, unknown>): Map<string, string> {
  const examples = new Map<string, string>();
  const sections = Array.isArray(assignment.sections) ? assignment.sections : [];

  for (const rawSection of sections) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const section = rawSection as Record<string, unknown>;
    if (String(section.mode || "") !== "star-order") continue;
    const items = Array.isArray(section.items) ? section.items : [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const sentence = starOrderTexts(item)[0] || "";
      const tokens = Array.isArray(item.tokens) ? item.tokens : [];
      for (const rawToken of tokens) {
        if (!rawToken || typeof rawToken !== "object") continue;
        const surface = String((rawToken as Record<string, unknown>).text || "").trim();
        if (!isSuggestableSurface(surface, true)) continue;
        if (!examples.has(surface)) examples.set(surface, sentence || surface);
      }
    }
  }

  for (const text of extractJapaneseTextsFromAssignment(assignment)) {
    const runs = text.match(JA_RUN) || [];
    for (const run of runs) {
      const surface = run.trim();
      if (!isSuggestableSurface(surface)) continue;
      if (!examples.has(surface)) examples.set(surface, text);
    }
  }

  return examples;
}

function buildSuggestItemsFromAssignment(
  assignment: Record<string, unknown>
): MgLexiconSuggestItem[] {
  const examples = collectSurfacesFromAssignment(assignment);
  const items: MgLexiconSuggestItem[] = [];
  for (const [surface, example] of examples) {
    if (isBaselineCovered(surface)) continue;
    items.push({
      fingerprint: "custom:" + surface,
      surface,
      kind: "custom",
      title: "Define: " + surface,
      example,
    });
    if (items.length >= 20) break;
  }
  return items;
}

export async function suggestMgLexiconFromAssignment(
  assignment: Record<string, unknown>,
  worksheetId: string,
  worksheetTitle: string,
  env: KvEnv,
  teacherUsername?: string
): Promise<{ added: number; skipped: number; pending: number; texts: number; candidates: number }> {
  const texts = extractJapaneseTextsFromAssignment(assignment);
  const items = buildSuggestItemsFromAssignment(assignment);
  if (!items.length) {
    return { added: 0, skipped: 0, pending: 0, texts: texts.length, candidates: 0 };
  }
  const result = await suggestMgLexiconBatch(
    {
      teacherUsername: teacherUsername || TEACHER_DEFAULT,
      worksheetId,
      worksheetTitle,
      items,
    },
    env
  );
  return { ...result, texts: texts.length, candidates: items.length };
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

  if (item.kind === "split") {
    const surfaces = (item.draft?.splitSurfaces || [])
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (surfaces.length >= 2) {
      const key = surfaces.join("|");
      if (overlay.segmentSurfaceSequences.some((seq) => seq.surfaces.join("|") === key)) {
        return true;
      }
    }
  }

  if (overlay.forceUnits.includes(surface)) return true;
  if (overlay.custom[surface]) return true;
  if (item.kind === "custom" && isBaselineCovered(surface)) return true;

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
    if (pendingSurfaces.has(surface) && rawItem.kind !== "merge" && rawItem.kind !== "split") {
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
