/** Published homework in KV (teacher → student hub, no git deploy). */

import { extractPlaylistId, extractVideoId, fetchLatestVideoFromPlaylist } from "./youtube-playlist";
import { repairAssignmentRecord } from "./homework-encoding";
import {
  getUserAccount,
  updateUserAccountSettings,
  normalizeAccountLabel,
  normalizeAccountTier,
  deleteUserAccount,
  isCurriculumTrialActive,
  curriculumTrialEndsMs,
  CURRICULUM_TRIAL_HOMEWORK_ID,
  type AccountLabel,
  type AccountTier,
} from "./user-accounts";

export interface StudentListEntry {
  username: string;
  displayName: string;
  /** Teacher-only dropdown label. Hub name stays on the student account. */
  teacherListName?: string;
  /** Confirmed PayPal payer, or a demo login. */
  subscriber?: boolean;
}

export interface CatalogFile {
  playlistUrl?: string;
  reviewPlaylistUrl?: string;
  students?: StudentListEntry[];
  studentProfiles?: Record<
    string,
    {
      latestLessonUrl?: string;
      youtubeUrl?: string;
      lessonPlaylistUrl?: string;
      reviewPlaylistUrl?: string;
      currentHomeworkId?: string;
      /** Queued sheet ids waiting until student finishes Done reviewing (FIFO). */
      waitingHomeworkIds?: string[];
    }
  >;
  assignments?: Record<string, unknown>[];
  /** Student-scoped catalog only. Tells the hub when a curriculum trial ends. */
  curriculumTrial?: {
    endsAt: string;
    homeworkId: string;
    baseLabel: AccountLabel;
    baseTier: AccountTier;
  };
}

/** Active + waiting slots per student hub. */
const HUB_HOMEWORK_SLOT_MAX = 4;

const KV_INDEX = "catalog-index";
/** Denormalized catalog list — one KV read instead of N catalog:{id} gets. */
const KV_CATALOG_ENTRIES = "catalog-entries-v1";
const assignmentKey = (id: string) => `assignment:${id}`;
const catalogKey = (id: string) => `catalog:${id}`;
const studentYoutubeKey = (username: string) => `student:${username}:youtube`;
const studentLessonPlaylistKey = (username: string) => `student:${username}:lesson-playlist`;
const studentCurrentHomeworkKey = (username: string) => `student:${username}:current-homework`;
const studentHomeworkWaitingKey = (username: string) => `student:${username}:homework-waiting`;
const homeworkDraftKey = (username: string, assignmentId: string) =>
  `hw-draft:${username}:${assignmentId}`;
const studentAccountSettingsKey = (username: string) => `student:${username}:account-settings`;
const studentDiscordKey = (username: string) => `student:${username}:discord-user-id`;
const studentTeacherListNameKey = (username: string) =>
  `student:${username}:teacher-list-name`;
const studentNotifyPrefsKey = (username: string) => `student:${username}:notify-prefs`;
const playlistLatestCacheKey = (username: string, playlistId: string) =>
  `student:${username}:playlist-latest-v5:${playlistId}`;
/** Last uploadDate-confirmed latest lesson — kept when YouTube bot-blocks live date reads. */
const playlistLatestConfirmedKey = (username: string, playlistId: string) =>
  `student:${username}:playlist-latest-confirmed:${playlistId}`;

const PLAYLIST_LATEST_TTL_SEC = 3600;

export interface PublishPayload {
  teacherUsername?: string;
  studentUsername?: string;
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
  youtubeUrl?: string;
  lessonPlaylistUrl?: string;
  /** Teacher override: make this the open sheet (Student info current-HW). */
  forceCurrent?: boolean;
  /** Stealth edit: swap the homework without DMing the student. */
  silent?: boolean;
}

export interface StudentProfilePayload {
  teacherUsername?: string;
  studentUsername?: string;
  youtubeUrl?: string;
  lessonPlaylistUrl?: string;
  accountLabel?: AccountLabel;
  tier?: AccountTier;
  /** Discord snowflake for student DMs (digits only). Empty string clears. */
  discordUserId?: string;
  /** Teacher dropdown name only. Empty string clears (hub name stays). */
  teacherListName?: string;
}

export interface StudentProfileView {
  student: string;
  youtubeUrl: string;
  lessonPlaylistUrl: string;
  accountLabel: AccountLabel;
  tier: AccountTier;
  hasKvAccount: boolean;
  currentHomeworkId: string;
  currentHomeworkTitle: string;
  waitingHomeworkIds: string[];
  discordUserId: string;
  hubDisplayName: string;
  teacherListName: string;
  /** Active + queued hub rows with worksheet vs notes-review status. */
  hubSlots?: StudentHubSlotView[];
}

export type HubSlotStatus = "incomplete" | "in_progress" | "submitted" | "jd_memo";

export interface StudentHubSlotView {
  assignmentId: string;
  title: string;
  role: "active" | "queued";
  status: HubSlotStatus;
  statusLabel: string;
}

const HUB_SLOT_STATUS_LABELS: Record<HubSlotStatus, string> = {
  incomplete: "Incomplete",
  in_progress: "In progress",
  submitted: "Submitted",
  jd_memo: "JD Memo",
};

export interface SaveWorksheetPayload {
  teacherUsername?: string;
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
}

export interface DeleteWorksheetPayload {
  teacherUsername?: string;
  worksheetId?: string;
}

export interface SetWorksheetCategoryPayload {
  teacherUsername?: string;
  worksheetId?: string;
  wsCategory?: string;
}

/** Worksheet library buckets (WS courses). Built-in + custom slugs from KV. */
export type WorksheetCategory = string;

const KV_WS_CATEGORIES = "ws-categories-v1";
const CORE_JAPANESE_DEFAULT_IDS = new Set(["sheet-secret-hiragana"]);

/** Legacy worksheet ids → neutral ids (no student usernames in URLs). */
const ASSIGNMENT_ID_ALIASES: Record<string, string> = {
  "sykohpath-secret-hiragana": "sheet-secret-hiragana",
};

export function normalizeAssignmentId(raw: string): string {
  const id = String(raw || "").trim();
  return ASSIGNMENT_ID_ALIASES[id] || id;
}

export function assignmentIdLookupKeys(id: string): string[] {
  const normalized = normalizeAssignmentId(id);
  const keys = new Set<string>([normalized]);
  for (const [legacy, canonical] of Object.entries(ASSIGNMENT_ID_ALIASES)) {
    if (canonical === normalized || legacy === id) {
      keys.add(legacy);
      keys.add(canonical);
    }
  }
  return [...keys];
}
const WS_CATEGORY_SLUG_RE = /^[a-z0-9-]{1,32}$/;

export function normalizeWsCategory(raw: unknown): WorksheetCategory | undefined {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (key === "core-japanese" || key === "core-social-japanese" || key === "corejp") {
    return "core-japanese";
  }
  if (key === "other") return "other";
  if (key === "jlpt") return "jlpt";
  if (key === "christian" || key === "gospel") return "christian";
  if (key === "music") return "music";
  if (WS_CATEGORY_SLUG_RE.test(key)) return key;
  return undefined;
}

export function defaultWsCategory(id: string): WorksheetCategory {
  return CORE_JAPANESE_DEFAULT_IDS.has(String(id || "").trim()) ? "core-japanese" : "other";
}

export function resolveWsCategory(
  entry: { id?: unknown; wsCategory?: unknown },
  map?: Record<string, string>
): WorksheetCategory {
  const id = String(entry?.id || "").trim();
  return (
    normalizeWsCategory(entry?.wsCategory) ||
    normalizeWsCategory(map?.[id]) ||
    defaultWsCategory(id)
  );
}

async function readWsCategoryMap(kv: KVNamespace): Promise<Record<string, string>> {
  try {
    const raw = await kv.get(KV_WS_CATEGORIES);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const cat = normalizeWsCategory(value);
      if (id && cat) out[id] = cat;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeWsCategoryMap(
  kv: KVNamespace,
  map: Record<string, string>
): Promise<void> {
  await kv.put(KV_WS_CATEGORIES, JSON.stringify(map));
}

export async function setWorksheetWsCategory(
  data: SetWorksheetCategoryPayload,
  env: KvEnv
): Promise<{ id: string; wsCategory: WorksheetCategory }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.worksheetId || "").trim();
  if (!id) throw new Error("ID_REQUIRED");
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("INVALID_ID");

  const wsCategory = normalizeWsCategory(data.wsCategory) || "other";
  const map = await readWsCategoryMap(kv);
  map[id] = wsCategory;
  await writeWsCategoryMap(kv, map);

  const existingRaw = await kv.get(catalogKey(id));
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as Record<string, unknown>;
      existing.wsCategory = wsCategory;
      await kv.put(catalogKey(id), JSON.stringify(existing));
      await upsertCatalogEntriesBlob(kv, existing);
    } catch {
      /* map is enough */
    }
  }

  return { id, wsCategory };
}

interface KvEnv {
  HOMEWORK_KV?: KVNamespace;
  HW_TEACHER_USER?: string;
  MISTAKES_LOG_KEY?: string;
}

const TEACHER_DEFAULT = "jlm";

/** Legacy demo students + teacher publish list (public/js/hw-auth.js ACCOUNTS). */
const STUDENT_ACCOUNTS = new Set([
  "benm",
  "joshs",
  "deme",
  "ivan",
  "benc",
  "demo2",
  "christian",
]);

const LEGACY_STUDENT_LABELS: Record<string, string> = {
  benm: "Ben M",
  joshs: "Josh S",
  deme: "Deme",
  ivan: "Ivan",
  benc: "benc",
  demo2: "Demo3",
  christian: "Christian",
};

const USERS_INDEX = "user-accounts-index";
/** Fast student dropdown list — rebuilt when missing / invalidated. */
const KV_STUDENT_LIST = "student-list-v3";
/** Usernames removed by teacher wipe — stay off the student list even if legacy/demo. */
const KV_WIPED_STUDENTS = "student-wiped-v1";
/** Old demo logins retired from code — keep them off the list if a wipe already happened. */
const RETIRED_DEMO_STUDENTS = ["alex"] as const;

const userAccountKey = (username: string) => `user-account:${username}`;

async function readRegisteredUsernames(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(USERS_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function readWipedStudents(kv: KVNamespace): Promise<Set<string>> {
  const raw = await kv.get(KV_WIPED_STUDENTS);
  if (!raw) return new Set();
  try {
    const ids = JSON.parse(raw) as string[];
    if (!Array.isArray(ids)) return new Set();
    return new Set(
      ids
        .map((id) => String(id || "").trim().toLowerCase())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

async function writeWipedStudents(
  kv: KVNamespace,
  wiped: Set<string>
): Promise<void> {
  await kv.put(KV_WIPED_STUDENTS, JSON.stringify([...wiped].sort()));
}

export async function markStudentWiped(
  kv: KVNamespace | undefined,
  username: string
): Promise<void> {
  if (!kv) return;
  const key = String(username || "")
    .trim()
    .toLowerCase();
  if (!key) return;
  const wiped = await readWipedStudents(kv);
  wiped.add(key);
  await writeWipedStudents(kv, wiped);
  await invalidateStudentListSnapshot(kv);
}

/** If they sign up again under the same username, put them back on the list. */
export async function clearStudentWiped(
  kv: KVNamespace | undefined,
  username: string
): Promise<void> {
  if (!kv) return;
  const key = String(username || "")
    .trim()
    .toLowerCase();
  if (!key) return;
  const wiped = await readWipedStudents(kv);
  if (!wiped.has(key)) return;
  wiped.delete(key);
  await writeWipedStudents(kv, wiped);
  await invalidateStudentListSnapshot(kv);
}

async function readStudentListBlob(
  kv: KVNamespace
): Promise<StudentListEntry[] | null> {
  const raw = await kv.get(KV_STUDENT_LIST);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { students?: StudentListEntry[] };
    if (!Array.isArray(parsed?.students)) return null;
    if (parsed.students.some((s) => typeof s?.subscriber !== "boolean")) return null;
    return parsed.students
      .map((s) => {
        const username = String(s?.username || "")
          .trim()
          .toLowerCase();
        const teacherListName = String(s?.teacherListName || "").trim();
        const displayName = String(s?.displayName || teacherListName || s?.username || "").trim();
        const row: StudentListEntry = { username, displayName, subscriber: s.subscriber };
        if (teacherListName) row.teacherListName = teacherListName;
        return row;
      })
      .filter((s) => s.username);
  } catch {
    return null;
  }
}

async function writeStudentListBlob(
  kv: KVNamespace,
  students: StudentListEntry[]
): Promise<void> {
  await kv.put(
    KV_STUDENT_LIST,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      students,
    })
  );
}

/** Drop cached student names so the next list rebuilds (signup / rename / wipe). */
export async function invalidateStudentListSnapshot(
  kv: KVNamespace | undefined
): Promise<void> {
  if (!kv) return;
  try {
    await kv.delete(KV_STUDENT_LIST);
  } catch {
    /* ignore */
  }
}

function normalizeTeacherListName(raw: unknown): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

async function readTeacherListName(kv: KVNamespace, username: string): Promise<string> {
  const key = String(username || "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  return normalizeTeacherListName(await kv.get(studentTeacherListNameKey(key)));
}

async function saveTeacherListName(
  kv: KVNamespace,
  username: string,
  raw: string
): Promise<void> {
  const key = String(username || "")
    .trim()
    .toLowerCase();
  if (!key) return;
  const name = normalizeTeacherListName(raw);
  const kvKey = studentTeacherListNameKey(key);
  if (!name) {
    await kv.delete(kvKey);
  } else {
    await kv.put(kvKey, name);
  }
  await invalidateStudentListSnapshot(kv);
}

/**
 * Grandfathered Homework Hub access (free forever — PayPal sub model retired).
 * Keep them in Subscribers even with no live PayPal subscription id.
 */
const CONFIRMED_PAYPAL_PAYERS = new Set([
  "sykohpath",
  "secretsister5",
  "kaetherjk",
  "garywgipson",
  "nekobi",
]);

/**
 * Pays for private lessons, not a PayPal homework checkout.
 * Count them in the Subscribers dropdown without setting paypalPaid.
 */
const LESSON_PAYER_SUBSCRIBERS = new Set(["christian"]);

function isRealHomeworkSubscriber(username: string, paypalPaid: boolean): boolean {
  const key = String(username || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  if (key.includes("demo")) return true;
  if (CONFIRMED_PAYPAL_PAYERS.has(key)) return true;
  if (LESSON_PAYER_SUBSCRIBERS.has(key)) return true;
  return paypalPaid;
}

async function readStudentSubscriberFlag(kv: KVNamespace, username: string): Promise<boolean> {
  const key = String(username || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  let paypalPaid = false;
  let trialEnds = "";
  const raw = await kv.get(userAccountKey(key));
  if (raw) {
    try {
      const account = JSON.parse(raw) as { paypalPaid?: boolean; curriculumTrialEndsAt?: string };
      paypalPaid = account.paypalPaid === true;
      trialEnds = String(account.curriculumTrialEndsAt || "");
    } catch {
      paypalPaid = false;
    }
  }
  if (isRealHomeworkSubscriber(key, paypalPaid)) return true;
  return isCurriculumTrialActive(trialEnds);
}

function listEntryFromNames(
  username: string,
  hubDisplayName: string,
  teacherListName: string
): StudentListEntry {
  const hub = String(hubDisplayName || username).trim() || username;
  const custom = normalizeTeacherListName(teacherListName);
  const row: StudentListEntry = {
    username,
    displayName: custom || hub,
  };
  if (custom) row.teacherListName = custom;
  return row;
}

async function rebuildStudentList(kv: KVNamespace): Promise<StudentListEntry[]> {
  let wiped = await readWipedStudents(kv);
  let wipedChanged = false;
  for (const retired of RETIRED_DEMO_STUDENTS) {
    if (!wiped.has(retired)) {
      wiped.add(retired);
      wipedChanged = true;
    }
  }
  if (wipedChanged) {
    try {
      await writeWipedStudents(kv, wiped);
    } catch {
      /* rebuild still filters in-memory */
    }
  }

  const byUser = new Map<string, StudentListEntry>();
  const legacyRows = await Promise.all(
    [...STUDENT_ACCOUNTS].filter((username) => !wiped.has(username)).map(async (username) => {
      const teacherListName = await readTeacherListName(kv, username);
      return listEntryFromNames(
        username,
        LEGACY_STUDENT_LABELS[username] || username,
        teacherListName
      );
    })
  );
  for (const row of legacyRows) {
    byUser.set(row.username, row);
  }

  const ids = await readRegisteredUsernames(kv);
  const accountRows = await Promise.all(
    ids.map(async (username) => {
      const key = String(username || "")
        .trim()
        .toLowerCase();
      if (!key || wiped.has(key)) return null;
      const [raw, teacherListName] = await Promise.all([
        kv.get(userAccountKey(key)),
        readTeacherListName(kv, key),
      ]);
      if (!raw) return null;
      try {
        const account = JSON.parse(raw) as {
          username?: string;
          displayName?: string;
          role?: string;
        };
        if (account.role !== "student") return null;
        return listEntryFromNames(
          String(account.username || key)
            .trim()
            .toLowerCase(),
          String(account.displayName || account.username || key).trim(),
          teacherListName
        );
      } catch {
        return null;
      }
    })
  );
  for (const row of accountRows) {
    if (row?.username && !wiped.has(row.username)) byUser.set(row.username, row);
  }

  try {
    const published = await loadPublishedCatalogEntries(kv);
    for (const entry of published) {
      for (const user of (entry.students as string[]) || []) {
        const key = String(user || "")
          .trim()
          .toLowerCase();
        if (!key || byUser.has(key) || wiped.has(key)) continue;
        const teacherListName = await readTeacherListName(kv, key);
        byUser.set(
          key,
          listEntryFromNames(key, LEGACY_STUDENT_LABELS[key] || key, teacherListName)
        );
      }
    }
  } catch {
    /* registered accounts still usable if catalog list fails */
  }

  const students = (
    await Promise.all(
      [...byUser.values()].map(async (row) => ({
        ...row,
        subscriber: await readStudentSubscriberFlag(kv, row.username),
      }))
    )
  ).sort((a, b) => a.username.localeCompare(b.username));
  try {
    await writeStudentListBlob(kv, students);
  } catch {
    /* list still works if snapshot write fails */
  }
  return students;
}

export async function listAllStudentAccounts(
  kv: KVNamespace
): Promise<StudentListEntry[]> {
  const cached = await readStudentListBlob(kv);
  if (cached) return cached;
  return rebuildStudentList(kv);
}

function isTeacher(username: string | undefined, env: KvEnv): boolean {
  const allowed = (env.HW_TEACHER_USER || TEACHER_DEFAULT).toLowerCase();
  return String(username || "")
    .trim()
    .toLowerCase() === allowed;
}

function matchesMistakesLogKey(key: string | undefined, env: KvEnv): boolean {
  const secret = String(env.MISTAKES_LOG_KEY || "").trim();
  const provided = String(key || "").trim();
  if (!secret || !provided || secret.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) {
    mismatch |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Teacher hub login or mistakes quick-log secret URL. */
export function isTeacherMistakesAccess(
  data: { teacherUsername?: string; mistakesKey?: string },
  env: KvEnv
): boolean {
  if (isTeacher(data.teacherUsername, env)) return true;
  return matchesMistakesLogKey(data.mistakesKey, env);
}

async function readIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(KV_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writeIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(KV_INDEX, JSON.stringify(unique));
}

async function readCatalogEntriesBlob(
  kv: KVNamespace
): Promise<Record<string, unknown>[] | null> {
  const raw = await kv.get(KV_CATALOG_ENTRIES);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { entries?: Record<string, unknown>[] };
    return Array.isArray(parsed?.entries) ? parsed.entries : null;
  } catch {
    return null;
  }
}

async function writeCatalogEntriesBlob(
  kv: KVNamespace,
  entries: Record<string, unknown>[]
): Promise<void> {
  await kv.put(
    KV_CATALOG_ENTRIES,
    JSON.stringify({ savedAt: new Date().toISOString(), entries })
  );
}

async function upsertCatalogEntriesBlob(
  kv: KVNamespace,
  entry: Record<string, unknown>
): Promise<void> {
  const id = String(entry?.id || "").trim();
  if (!id) return;
  const existing = (await readCatalogEntriesBlob(kv)) || [];
  const next = existing.filter((e) => String(e?.id || "") !== id);
  next.unshift(entry);
  await writeCatalogEntriesBlob(kv, next);
}

async function removeCatalogEntriesBlob(kv: KVNamespace, id: string): Promise<void> {
  const sheetId = String(id || "").trim();
  if (!sheetId) return;
  const existing = await readCatalogEntriesBlob(kv);
  if (!existing) return;
  await writeCatalogEntriesBlob(
    kv,
    existing.filter((e) => String(e?.id || "") !== sheetId)
  );
}

async function rebuildCatalogEntriesFromIndex(
  kv: KVNamespace
): Promise<Record<string, unknown>[]> {
  const ids = await readIndex(kv);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(catalogKey(id));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        /* Repair in memory only — never rewrite during list (was a big catalog stall). */
        const { assignment: entry } = repairAssignmentRecord(parsed);
        return entry;
      } catch {
        return null;
      }
    })
  );
  return rows.filter((e): e is Record<string, unknown> => Boolean(e));
}

async function applyStudentMedia(
  kv: KVNamespace,
  student: string,
  opts: { youtubeUrl?: string; lessonPlaylistUrl?: string }
): Promise<void> {
  if (opts.youtubeUrl !== undefined) {
    const youtube = String(opts.youtubeUrl || "").trim();
    if (youtube) {
      await kv.put(studentYoutubeKey(student), youtube);
    } else {
      await kv.delete(studentYoutubeKey(student));
    }
  }

  if (opts.lessonPlaylistUrl !== undefined) {
    const playlist = String(opts.lessonPlaylistUrl || "").trim();
    if (playlist) {
      await kv.put(studentLessonPlaylistKey(student), playlist);
    } else {
      await kv.delete(studentLessonPlaylistKey(student));
    }
  }
}

interface StoredStudentAccountSettings {
  accountLabel: AccountLabel;
  tier: AccountTier;
}

async function readStudentAccountSettingsOverride(
  kv: KVNamespace,
  student: string
): Promise<StoredStudentAccountSettings | null> {
  const raw = await kv.get(studentAccountSettingsKey(student));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredStudentAccountSettings>;
    const accountLabel = normalizeAccountLabel(data.accountLabel);
    const tier = normalizeAccountTier(data.tier);
    if (!accountLabel || !tier) return null;
    return { accountLabel, tier };
  } catch {
    return null;
  }
}

async function writeStudentAccountSettingsOverride(
  kv: KVNamespace,
  student: string,
  settings: StoredStudentAccountSettings
): Promise<void> {
  await kv.put(studentAccountSettingsKey(student), JSON.stringify(settings));
}

export async function getStudentAccountSettings(
  student: string,
  env: KvEnv
): Promise<{ accountLabel: AccountLabel; tier: AccountTier; hasKvAccount: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(student || "")
    .trim()
    .toLowerCase();
  const account = await getUserAccount(user, env);
  if (account) {
    const endsAt = String(account.curriculumTrialEndsAt || "").trim();
    if (curriculumTrialEndsMs(endsAt) !== null) {
      if (isCurriculumTrialActive(endsAt)) {
        return {
          accountLabel: "current_student",
          tier: "student_special",
          hasKvAccount: true,
        };
      }
      return {
        accountLabel: "homework_only",
        tier: "pending",
        hasKvAccount: true,
      };
    }
    return {
      accountLabel: account.accountLabel || "homework_only",
      tier: account.tier || "pending",
      hasKvAccount: true,
    };
  }

  const override = await readStudentAccountSettingsOverride(kv, user);
  if (override) {
    return { ...override, hasKvAccount: false };
  }

  return {
    accountLabel: "homework_only",
    tier: "pending",
    hasKvAccount: false,
  };
}

async function saveStudentAccountSettings(
  kv: KVNamespace,
  student: string,
  patch: { accountLabel?: AccountLabel; tier?: AccountTier }
): Promise<void> {
  const nextLabel = patch.accountLabel
    ? normalizeAccountLabel(patch.accountLabel)
    : null;
  if (patch.accountLabel !== undefined && !nextLabel) {
    throw new Error("INVALID_ACCOUNT_LABEL");
  }

  const nextTier = patch.tier ? normalizeAccountTier(patch.tier) : null;
  if (patch.tier !== undefined && !nextTier) {
    throw new Error("INVALID_ACCOUNT_TIER");
  }

  if (!nextLabel && !nextTier) return;

  const updated = await updateUserAccountSettings(
    student,
    {
      ...(nextLabel ? { accountLabel: nextLabel } : {}),
      ...(nextTier ? { tier: nextTier } : {}),
    },
    { HOMEWORK_KV: kv }
  );

  if (updated) return;

  const current = (await readStudentAccountSettingsOverride(kv, student)) || {
    accountLabel: "homework_only" as AccountLabel,
    tier: "pending" as AccountTier,
  };

  await writeStudentAccountSettingsOverride(kv, student, {
    accountLabel: nextLabel || current.accountLabel,
    tier: nextTier || current.tier,
  });
  await invalidateStudentListSnapshot(kv);
}

export async function getStudentProfileForTeacher(
  data: { teacherUsername?: string; studentUsername?: string },
  env: KvEnv,
  staticStudentProfiles?: CatalogFile["studentProfiles"]
): Promise<StudentProfileView> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const student = String(data.studentUsername || "")
    .trim()
    .toLowerCase();
  if (!student) throw new Error("STUDENT_REQUIRED");
  if (!(await isKnownStudentInKv(student, kv))) throw new Error("UNKNOWN_STUDENT");

  const staticProfile = staticStudentProfiles?.[student] || {};
  const youtubeUrl =
    String((await kv.get(studentYoutubeKey(student))) || "").trim() ||
    String(staticProfile.latestLessonUrl || staticProfile.youtubeUrl || "").trim();
  const lessonPlaylistUrl =
    String((await kv.get(studentLessonPlaylistKey(student))) || "").trim() ||
    String(staticProfile.lessonPlaylistUrl || staticProfile.reviewPlaylistUrl || "").trim();
  const account = await getStudentAccountSettings(student, env);

  const currentHomeworkId = String(
    (await kv.get(studentCurrentHomeworkKey(student))) || ""
  ).trim();
  let currentHomeworkTitle = "";
  if (currentHomeworkId) {
    const catalogRaw = await kv.get(catalogKey(currentHomeworkId));
    if (catalogRaw) {
      try {
        const entry = JSON.parse(catalogRaw) as { title?: string };
        currentHomeworkTitle = String(entry.title || "").trim();
      } catch {
        /* ignore */
      }
    }
    if (!currentHomeworkTitle) {
      const assignmentRaw = await kv.get(assignmentKey(currentHomeworkId));
      if (assignmentRaw) {
        try {
          const assignment = JSON.parse(assignmentRaw) as { title?: string };
          currentHomeworkTitle = String(assignment.title || "").trim();
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    student,
    youtubeUrl,
    lessonPlaylistUrl,
    accountLabel: account.accountLabel,
    tier: account.tier,
    hasKvAccount: account.hasKvAccount,
    currentHomeworkId,
    currentHomeworkTitle,
    waitingHomeworkIds: await readHomeworkWaitingQueue(kv, student),
    discordUserId: String((await kv.get(studentDiscordKey(student))) || "").trim(),
    hubDisplayName: String(
      (await getUserAccount(student, env))?.displayName ||
        LEGACY_STUDENT_LABELS[student] ||
        student
    ).trim(),
    teacherListName: await readTeacherListName(kv, student),
    hubSlots: await buildStudentHubSlots(kv, student),
  };
}

const HW_DAILY_PAID_TIERS = new Set<AccountTier>([
  "tier1",
  "tier2",
  "tier3",
  "student_special",
]);

const HW_DAILY_SKIP_USERS = new Set([
  "demoprem",
  "premdemo",
  "demo",
  "jlm",
  "noplan",
  /* Inactive — stay off the weekly waiting ping and cadence reminders. */
  "benc",
  "drew",
  "faye",
  "ivan",
  "joshs",
]);

const HW_DAILY_SKIP_NAMES = new Set(["benc", "drew", "faye", "ivan", "josh s"]);

/** Weekly HW-waiting ping and cadence reminders. Inactive students stay off both. */
export function skipHwWaitingPing(username: string, displayName?: string): boolean {
  const u = String(username || "")
    .trim()
    .toLowerCase();
  if (!u || HW_DAILY_SKIP_USERS.has(u) || u.includes("demo")) return true;
  const name = String(displayName || "")
    .trim()
    .toLowerCase();
  return Boolean(name && HW_DAILY_SKIP_NAMES.has(name));
}

async function resolveHomeworkTitle(kv: KVNamespace, assignmentId: string): Promise<string> {
  const id = String(assignmentId || "").trim();
  if (!id) return "";
  const catalogRaw = await kv.get(catalogKey(id));
  if (catalogRaw) {
    try {
      const entry = JSON.parse(catalogRaw) as { title?: string };
      const title = String(entry.title || "").trim();
      if (title) return title;
    } catch {
      /* ignore */
    }
  }
  const assignmentRaw = await kv.get(assignmentKey(id));
  if (assignmentRaw) {
    try {
      const assignment = JSON.parse(assignmentRaw) as { title?: string };
      return String(assignment.title || "").trim();
    } catch {
      /* ignore */
    }
  }
  return id;
}

export type HwDailyWaitingBucket =
  | "needs"
  | "sent"
  | "review"
  | "reviewingNotes"
  | "caughtUp";

export interface HwDailyWaitingRow {
  username: string;
  displayName: string;
  title?: string;
  bucket: HwDailyWaitingBucket;
  /** Latest submitted sheet — used for a one-tap review link. */
  submissionId?: string;
}

export interface HwDailyWaitingReport {
  needs: HwDailyWaitingRow[];
  sent: HwDailyWaitingRow[];
  review: HwDailyWaitingRow[];
  /** Teacher notes are out; student hasn’t clicked Done reviewing yet. */
  reviewingNotes: HwDailyWaitingRow[];
  caughtUp: HwDailyWaitingRow[];
}

function includeInHwDailyPing(
  username: string,
  tier: AccountTier,
  accountLabel: AccountLabel
): boolean {
  if (skipHwWaitingPing(username)) return false;
  if (HW_DAILY_PAID_TIERS.has(tier)) return true;
  return accountLabel === "current_student";
}

/** Snapshot for JD’s daily Discord “who needs HW / who’s waiting” ping. */
export async function collectHwDailyWaitingReport(
  env: KvEnv
): Promise<HwDailyWaitingReport> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const students = await listAllStudentAccounts(kv);
  const needs: HwDailyWaitingRow[] = [];
  const sent: HwDailyWaitingRow[] = [];
  const review: HwDailyWaitingRow[] = [];
  const reviewingNotes: HwDailyWaitingRow[] = [];
  const caughtUp: HwDailyWaitingRow[] = [];

  type SubRow = Awaited<ReturnType<typeof listHomeworkSubmissions>>[number];
  type SheetStatus = "submitted" | "reviewed" | "acknowledged" | "none";

  function isOnline(sub: SubRow): boolean {
    return !sub.type || sub.type === "online";
  }

  function isMediaOnly(sub: SubRow): boolean {
    return sub.type === "video" || sub.type === "photo";
  }

  function newer(a: SubRow, b: SubRow): boolean {
    return new Date(a.submittedAt || 0).getTime() > new Date(b.submittedAt || 0).getTime();
  }

  /** Prefer online sheet status; companion video/photo alone only counts if no online notes yet. */
  function sheetStatus(subs: SubRow[]): SheetStatus {
    let latestOnline: SubRow | null = null;
    let mediaSubmitted = false;
    for (const sub of subs) {
      if (isOnline(sub)) {
        if (!latestOnline || newer(sub, latestOnline)) latestOnline = sub;
      } else if (isMediaOnly(sub) && sub.reviewStatus === "submitted") {
        mediaSubmitted = true;
      }
    }
    if (latestOnline) {
      const st = String(latestOnline.reviewStatus || "").toLowerCase();
      if (st === "submitted" || st === "reviewed" || st === "acknowledged") {
        return st as SheetStatus;
      }
      return "submitted";
    }
    return mediaSubmitted ? "submitted" : "none";
  }

  for (const entry of students) {
    const username = String(entry.username || "")
      .trim()
      .toLowerCase();
    if (!username) continue;

    const settings = await getStudentAccountSettings(username, env);
    if (!includeInHwDailyPing(username, settings.tier, settings.accountLabel)) {
      continue;
    }

    const displayName = String(
      entry.teacherListName || entry.displayName || LEGACY_STUDENT_LABELS[username] || username
    ).trim();
    if (skipHwWaitingPing(username, displayName)) continue;

    const currentHomeworkId = String(
      (await kv.get(studentCurrentHomeworkKey(username))) || ""
    ).trim();
    const waiting = await readHomeworkWaitingQueue(kv, username);
    const hasLive = Boolean(currentHomeworkId) || waiting.length > 0;

    const submissions = await listHomeworkSubmissions(env, {
      student: username,
      limit: 40,
    });

    const byAssignment = new Map<string, SubRow[]>();
    for (const sub of submissions) {
      const aid = String(sub.assignmentId || "").trim();
      if (!aid) continue;
      const list = byAssignment.get(aid) || [];
      list.push(sub);
      byAssignment.set(aid, list);
    }

    async function titleFor(assignmentId: string, fallback?: SubRow): Promise<string | undefined> {
      const resolved = assignmentId ? await resolveHomeworkTitle(kv, assignmentId) : "";
      return (
        resolved ||
        String(fallback?.title || fallback?.lessonName || "").trim() ||
        undefined
      );
    }

    const currentSubs = currentHomeworkId ? byAssignment.get(currentHomeworkId) || [] : [];
    const currentStatus = currentHomeworkId ? sheetStatus(currentSubs) : "none";

    if (currentStatus === "submitted") {
      const waitingSub =
        currentSubs.find((s) => String(s.reviewStatus || "").toLowerCase() === "submitted") ||
        currentSubs[0];
      review.push({
        username,
        displayName,
        title: await titleFor(currentHomeworkId, waitingSub),
        bucket: "review",
        submissionId: waitingSub?.id,
      });
      continue;
    }

    if (currentStatus === "reviewed") {
      reviewingNotes.push({
        username,
        displayName,
        title: await titleFor(currentHomeworkId, currentSubs[0]),
        bucket: "reviewingNotes",
      });
      continue;
    }

    let otherReviewId = "";
    let otherReviewSub: SubRow | undefined;
    for (const [aid, subs] of byAssignment) {
      if (aid === currentHomeworkId) continue;
      if (sheetStatus(subs) === "submitted") {
        otherReviewId = aid;
        otherReviewSub = subs[0];
        break;
      }
    }
    if (otherReviewId) {
      review.push({
        username,
        displayName,
        title: await titleFor(otherReviewId, otherReviewSub),
        bucket: "review",
        submissionId: otherReviewSub?.id,
      });
      continue;
    }

    /* Acknowledged = they submitted, you reviewed, they finished the notes.
       Stale current-homework still pointing at that sheet is not “needs to complete”. */
    if (currentStatus === "acknowledged") {
      let nextOpenId = "";
      let nextReviewedId = "";
      let nextReviewedSub: SubRow | undefined;
      for (const id of waiting) {
        const queued = byAssignment.get(id) || [];
        const st = sheetStatus(queued);
        if (st === "reviewed" && !nextReviewedId) {
          nextReviewedId = id;
          nextReviewedSub = queued[0];
        } else if (st === "none" && !nextOpenId) {
          nextOpenId = id;
        }
      }
      if (nextReviewedId) {
        reviewingNotes.push({
          username,
          displayName,
          title: await titleFor(nextReviewedId, nextReviewedSub),
          bucket: "reviewingNotes",
        });
        continue;
      }
      if (nextOpenId) {
        sent.push({
          username,
          displayName,
          title: await titleFor(nextOpenId),
          bucket: "sent",
        });
        continue;
      }
      needs.push({
        username,
        displayName,
        title: "finished last sheet — make a new one",
        bucket: "needs",
      });
      continue;
    }

    if (!hasLive) {
      needs.push({ username, displayName, bucket: "needs" });
      continue;
    }

    const currentTitle = currentHomeworkId
      ? await resolveHomeworkTitle(kv, currentHomeworkId)
      : waiting[0]
        ? await resolveHomeworkTitle(kv, waiting[0])
        : "";

    sent.push({
      username,
      displayName,
      title: currentTitle || undefined,
      bucket: "sent",
    });
  }

  const byName = (a: HwDailyWaitingRow, b: HwDailyWaitingRow) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  needs.sort(byName);
  sent.sort(byName);
  review.sort(byName);
  reviewingNotes.sort(byName);
  caughtUp.sort(byName);

  return { needs, sent, review, reviewingNotes, caughtUp };
}

export async function saveStudentProfile(
  data: StudentProfilePayload,
  env: KvEnv
): Promise<{ student: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const student = String(data.studentUsername || "")
    .trim()
    .toLowerCase();
  if (!student) throw new Error("STUDENT_REQUIRED");
  if (!(await isKnownStudentInKv(student, kv))) throw new Error("UNKNOWN_STUDENT");

  const mediaOpts: { youtubeUrl?: string; lessonPlaylistUrl?: string } = {};
  if (data.youtubeUrl !== undefined) {
    mediaOpts.youtubeUrl = data.youtubeUrl;
  }
  if (data.lessonPlaylistUrl !== undefined) {
    mediaOpts.lessonPlaylistUrl = String(data.lessonPlaylistUrl || "").trim();
  }
  if (Object.keys(mediaOpts).length) {
    await applyStudentMedia(kv, student, mediaOpts);
  }

  const playlist = String(data.lessonPlaylistUrl || "").trim();
  if (playlist) {
    /* Playlist owns Latest lesson — drop frozen manual youtube so it can't stick. */
    await kv.delete(studentYoutubeKey(student));
    await resolveLatestLessonFromPlaylist(kv, student, playlist, true);
  }

  if (data.accountLabel !== undefined || data.tier !== undefined) {
    await saveStudentAccountSettings(kv, student, {
      accountLabel: data.accountLabel,
      tier: data.tier,
    });
  }

  if (data.discordUserId !== undefined) {
    await saveStudentDiscordUserId(kv, student, data.discordUserId);
  }

  if (data.teacherListName !== undefined) {
    await saveTeacherListName(kv, student, String(data.teacherListName || ""));
  }

  return { student };
}

/** Digits-only Discord snowflake, or empty to clear. */
export function normalizeDiscordUserIdInput(raw: string | undefined | null): string {
  const id = String(raw || "").trim();
  if (!id) return "";
  if (!/^\d{5,32}$/.test(id)) throw new Error("INVALID_DISCORD_USER_ID");
  return id;
}

export async function getStudentDiscordUserId(
  kv: KVNamespace,
  username: string
): Promise<string> {
  return String((await kv.get(studentDiscordKey(username.toLowerCase()))) || "").trim();
}

async function readHomeworkWaitingQueue(kv: KVNamespace, username: string): Promise<string[]> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return [];
  const raw = await kv.get(studentHomeworkWaitingKey(user));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      ),
    ];
  } catch {
    return [];
  }
}

async function writeHomeworkWaitingQueue(
  kv: KVNamespace,
  username: string,
  ids: string[]
): Promise<void> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return;
  const unique = [
    ...new Set(
      ids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ),
  ];
  if (!unique.length) {
    await kv.delete(studentHomeworkWaitingKey(user));
    return;
  }
  await kv.put(studentHomeworkWaitingKey(user), JSON.stringify(unique));
}

export interface HomeworkWaitingQueueReorderPayload {
  teacherUsername?: string;
  studentUsername?: string;
  waitingHomeworkIds?: string[];
}

export async function reorderHomeworkWaitingQueue(
  data: HomeworkWaitingQueueReorderPayload,
  env: KvEnv
): Promise<{ student: string; waitingHomeworkIds: string[] }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const student = String(data.studentUsername || "")
    .trim()
    .toLowerCase();
  if (!student) throw new Error("STUDENT_REQUIRED");
  if (!(await isKnownStudentInKv(student, kv))) throw new Error("UNKNOWN_STUDENT");

  const current = await readHomeworkWaitingQueue(kv, student);
  const next = (data.waitingHomeworkIds || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  if (current.length !== next.length) throw new Error("QUEUE_MISMATCH");
  const currentSet = new Set(current);
  for (const id of next) {
    if (!currentSet.has(id)) throw new Error("QUEUE_MISMATCH");
  }

  await writeHomeworkWaitingQueue(kv, student, next);
  return { student, waitingHomeworkIds: next };
}

async function getLatestOnlineSubmissionForAssignment(
  kv: KVNamespace,
  username: string,
  assignmentId: string
): Promise<HomeworkSubmission | null> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  const id = String(assignmentId || "").trim();
  if (!user || !id) return null;

  const studentIds = await readStudentSubmissionsIndex(kv, user);
  let submissions: HomeworkSubmission[];
  if (studentIds !== null) {
    submissions = await loadSubmissionsByIds(kv, studentIds);
  } else {
    const allIds = await readSubmissionsIndex(kv);
    const all = await loadSubmissionsByIds(kv, allIds);
    submissions = all.filter(
      (entry) => String(entry.username || "").toLowerCase() === user
    );
    await writeStudentSubmissionsIndex(
      kv,
      user,
      submissions.map((entry) => entry.id)
    );
  }

  const matches = submissions.filter(
    (entry) =>
      entry.type === "online" &&
      String(entry.assignmentId || "").trim() === id &&
      String(entry.username || "").toLowerCase() === user
  );
  if (!matches.length) return null;
  matches.sort(
    (a, b) =>
      new Date(b.submittedAt || b.reviewedAt || 0).getTime() -
      new Date(a.submittedAt || a.reviewedAt || 0).getTime()
  );
  return matches[0] || null;
}

function draftHasSavedAnswers(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const draft = JSON.parse(raw) as HomeworkDraft;
    const answers = draft.answers;
    if (!answers || typeof answers !== "object") return false;
    return Object.values(answers).some((value) => String(value ?? "").trim().length > 0);
  } catch {
    return false;
  }
}

async function resolveHubSlotStatus(
  kv: KVNamespace,
  username: string,
  assignmentId: string
): Promise<HubSlotStatus> {
  const latest = await getLatestOnlineSubmissionForAssignment(kv, username, assignmentId);
  if (!latest) {
    const draftRaw = await kv.get(homeworkDraftKey(username, assignmentId));
    return draftHasSavedAnswers(draftRaw) ? "in_progress" : "incomplete";
  }

  const status = String(latest.reviewStatus || "").toLowerCase();
  if (status === "reviewed" || latest.reviewedAt || latest.teacherNotesSubmittedAt) {
    return "jd_memo";
  }
  return "submitted";
}

async function buildStudentHubSlots(
  kv: KVNamespace,
  student: string
): Promise<StudentHubSlotView[]> {
  const currentHomeworkId = String(
    (await kv.get(studentCurrentHomeworkKey(student))) || ""
  ).trim();
  const waiting = await readHomeworkWaitingQueue(kv, student);
  const slots: StudentHubSlotView[] = [];

  async function pushSlot(id: string, role: "active" | "queued") {
    const assignmentId = String(id || "").trim();
    if (!assignmentId) return;
    const status = await resolveHubSlotStatus(kv, student, assignmentId);
    const title = (await resolveHomeworkTitle(kv, assignmentId)) || assignmentId;
    slots.push({
      assignmentId,
      title,
      role,
      status,
      statusLabel: HUB_SLOT_STATUS_LABELS[status],
    });
  }

  if (currentHomeworkId) await pushSlot(currentHomeworkId, "active");
  for (const id of waiting) await pushSlot(id, "queued");
  return slots;
}

/** True while student still has this sheet open (working / submitted / reading notes). */
async function isHomeworkCycleOpen(
  kv: KVNamespace,
  username: string,
  assignmentId: string
): Promise<boolean> {
  const id = String(assignmentId || "").trim();
  if (!id) return false;
  const latest = await getLatestOnlineSubmissionForAssignment(kv, username, id);
  if (!latest) return true;
  const status = latest.reviewStatus || "submitted";
  return status !== "acknowledged";
}

export async function saveStudentDiscordUserId(
  kv: KVNamespace,
  student: string,
  raw: string
): Promise<void> {
  const id = normalizeDiscordUserIdInput(raw);
  const key = studentDiscordKey(student.toLowerCase());
  if (id) await kv.put(key, id);
  else await kv.delete(key);
}

export type NotifyPrefs = {
  discord: boolean;
  sms: boolean;
  email: boolean;
  phonePing: boolean;
};

const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  discord: true,
  sms: false,
  email: false,
  phonePing: false,
};

export function normalizeNotifyPrefs(raw: unknown): NotifyPrefs {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    discord: data.discord !== false,
    sms: data.sms === true,
    email: data.email === true,
    phonePing: data.phonePing === true,
  };
}

export async function getStudentNotifyPrefs(
  kv: KVNamespace,
  username: string
): Promise<NotifyPrefs> {
  const raw = await kv.get(studentNotifyPrefsKey(username.toLowerCase()));
  if (!raw) return { ...DEFAULT_NOTIFY_PREFS };
  try {
    return normalizeNotifyPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

/** Email + display name saved on a student's account (empty when the account has none). */
export async function getStudentContact(
  kv: KVNamespace,
  username: string
): Promise<{ email: string; displayName: string }> {
  const raw = await kv.get(userAccountKey(String(username || "").trim().toLowerCase()));
  if (!raw) return { email: "", displayName: "" };
  try {
    const account = JSON.parse(raw) as { email?: string; displayName?: string };
    return {
      email: String(account.email || "").trim(),
      displayName: String(account.displayName || "").trim(),
    };
  } catch {
    return { email: "", displayName: "" };
  }
}

export async function saveStudentNotifyPrefs(
  kv: KVNamespace,
  username: string,
  prefs: NotifyPrefs
): Promise<NotifyPrefs> {
  const next = normalizeNotifyPrefs(prefs);
  await kv.put(
    studentNotifyPrefsKey(username.toLowerCase()),
    JSON.stringify(next)
  );
  return next;
}

export async function publishToStudentHub(
  data: PublishPayload,
  env: KvEnv,
  options?: { staticStudents?: string[] }
): Promise<{
  id: string;
  studentUrl: string;
  updated: boolean;
  queued: boolean;
  queueCount: number;
  waitingCount: number;
  currentHomeworkId: string;
  hubSlotsUsed: number;
  newlyAssigned: boolean;
}> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const assignment = data.assignment;
  const catalogEntry = { ...data.catalogEntry };
  const id = String(assignment.id || catalogEntry.id || "").trim();
  const student = String(data.studentUsername || "")
    .trim()
    .toLowerCase();

  if (!id) throw new Error("ID_REQUIRED");
  if (!student) throw new Error("STUDENT_REQUIRED");
  if (!(await isKnownStudentInKv(student, kv))) throw new Error("UNKNOWN_STUDENT");

  catalogEntry.id = id;
  assignment.id = id;

  let students = [student];
  const existingRaw = await kv.get(catalogKey(id));
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as { students?: string[] };
      const prev = (existing.students || []).map((s) => String(s).toLowerCase());
      students = [...new Set([...prev, student])];
    } catch {
      /* use [student] */
    }
  } else {
    const fromStatic = (options?.staticStudents || [])
      .map((s) => String(s).toLowerCase())
      .filter(Boolean);
    if (fromStatic.length) {
      students = [...new Set([...fromStatic, student])];
    }
  }
  catalogEntry.students = students;

  const today = new Date().toISOString().slice(0, 10);
  if (!catalogEntry.date) catalogEntry.date = today;
  catalogEntry.publishedAt = new Date().toISOString();
  assignment.date = assignment.date || catalogEntry.date;

  await applyStudentMedia(kv, student, {
    youtubeUrl:
      data.youtubeUrl !== undefined
        ? data.youtubeUrl
        : String(catalogEntry.youtubeUrl || assignment.youtubeUrl || "").trim() || undefined,
    lessonPlaylistUrl: data.lessonPlaylistUrl,
  });
  const youtube = String(data.youtubeUrl || catalogEntry.youtubeUrl || assignment.youtubeUrl || "").trim();
  if (youtube) {
    catalogEntry.youtubeUrl = youtube;
    assignment.youtubeUrl = youtube;
  }

  await kv.put(assignmentKey(id), JSON.stringify(assignment));
  await kv.put(catalogKey(id), JSON.stringify(catalogEntry));
  await upsertCatalogEntriesBlob(kv, catalogEntry);

  let currentHomeworkId = String((await kv.get(studentCurrentHomeworkKey(student))) || "").trim();
  let waiting = await readHomeworkWaitingQueue(kv, student);

  const index = await readIndex(kv);
  const updated = index.includes(id);
  if (!updated) {
    index.unshift(id);
    await writeIndex(kv, index);
  }

  const finish = (opts: {
    queued: boolean;
    currentHomeworkId: string;
    waiting: string[];
    newlyAssigned: boolean;
  }) => ({
    id,
    studentUrl: `/homework/platform.html#hw-${id}`,
    updated,
    queued: opts.queued,
    queueCount: opts.waiting.length,
    waitingCount: opts.waiting.length,
    currentHomeworkId: opts.currentHomeworkId,
    hubSlotsUsed: (opts.currentHomeworkId ? 1 : 0) + opts.waiting.length,
    newlyAssigned: opts.newlyAssigned,
  });

  /* Same sheet already current — refresh content only. */
  if (currentHomeworkId === id) {
    return finish({ queued: false, currentHomeworkId, waiting, newlyAssigned: false });
  }

  /* Same sheet already waiting — refresh content only (unless forcing to current). */
  if (waiting.includes(id) && !data.forceCurrent) {
    return finish({ queued: true, currentHomeworkId, waiting, newlyAssigned: false });
  }

  /* Finished cycle (Done reviewing) frees the current slot. */
  if (currentHomeworkId && !data.forceCurrent) {
    const cycleOpen = await isHomeworkCycleOpen(kv, student, currentHomeworkId);
    if (!cycleOpen) {
      await kv.delete(studentCurrentHomeworkKey(student));
      currentHomeworkId = "";
    }
  }

  if (data.forceCurrent) {
    waiting = waiting.filter((entry) => entry !== id);
    if (currentHomeworkId && currentHomeworkId !== id) {
      const cycleOpen = await isHomeworkCycleOpen(kv, student, currentHomeworkId);
      if (cycleOpen && !waiting.includes(currentHomeworkId)) {
        waiting = [currentHomeworkId, ...waiting];
      }
    }
    waiting = waiting.slice(0, HUB_HOMEWORK_SLOT_MAX - 1);
    await kv.put(studentCurrentHomeworkKey(student), id);
    await writeHomeworkWaitingQueue(kv, student, waiting);
    return finish({ queued: false, currentHomeworkId: id, waiting, newlyAssigned: true });
  }

  if (!currentHomeworkId) {
    await kv.put(studentCurrentHomeworkKey(student), id);
    return finish({ queued: false, currentHomeworkId: id, waiting, newlyAssigned: true });
  }

  const slotsUsed = 1 + waiting.length;
  if (slotsUsed >= HUB_HOMEWORK_SLOT_MAX) {
    throw new Error("HUB_FULL");
  }

  waiting = [...waiting, id];
  await writeHomeworkWaitingQueue(kv, student, waiting);
  return finish({ queued: true, currentHomeworkId, waiting, newlyAssigned: true });
}

/** Save a neutral worksheet to the library (not tied to a student yet). */
export async function saveWorksheetDraft(
  data: SaveWorksheetPayload,
  env: KvEnv
): Promise<{ id: string; updated: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const assignment = data.assignment;
  const catalogEntry = { ...data.catalogEntry };
  const id = String(assignment.id || catalogEntry.id || "").trim();
  if (!id) throw new Error("ID_REQUIRED");

  catalogEntry.id = id;
  assignment.id = id;
  assignment.status = assignment.status || "draft";

  const existingRaw = await kv.get(catalogKey(id));
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as {
        students?: string[];
        date?: string;
        publishedAt?: string;
        youtubeUrl?: string;
        lessonName?: string;
        summary?: string;
        forSale?: boolean;
        salePrice?: number;
        wsCategory?: string;
      };
      const prevStudents = (existing.students || []).map((s) => String(s).toLowerCase()).filter(Boolean);
      if (prevStudents.length) catalogEntry.students = prevStudents;
      if (!catalogEntry.date && existing.date) catalogEntry.date = existing.date;
      if (!catalogEntry.publishedAt && existing.publishedAt) {
        catalogEntry.publishedAt = existing.publishedAt;
      }
      if (!catalogEntry.youtubeUrl && existing.youtubeUrl) {
        catalogEntry.youtubeUrl = existing.youtubeUrl;
      }
      if (!catalogEntry.lessonName && existing.lessonName) {
        catalogEntry.lessonName = existing.lessonName;
      }
      if (!catalogEntry.summary && existing.summary) catalogEntry.summary = existing.summary;
      if (catalogEntry.forSale === undefined && existing.forSale !== undefined) {
        catalogEntry.forSale = existing.forSale;
      }
      if (catalogEntry.salePrice === undefined && existing.salePrice !== undefined) {
        catalogEntry.salePrice = existing.salePrice;
      }
      if (catalogEntry.wsCategory === undefined && existing.wsCategory !== undefined) {
        catalogEntry.wsCategory = existing.wsCategory;
      }
    } catch {
      /* keep incoming catalog entry */
    }
  }
  if (!Array.isArray(catalogEntry.students)) catalogEntry.students = [];

  const title = String(catalogEntry.title || assignment.title || id).trim();
  if (title) {
    catalogEntry.title = title;
    assignment.title = title;
  }

  const wsCategory =
    normalizeWsCategory(catalogEntry.wsCategory) || defaultWsCategory(id);
  catalogEntry.wsCategory = wsCategory;
  try {
    const map = await readWsCategoryMap(kv);
    map[id] = wsCategory;
    await writeWsCategoryMap(kv, map);
  } catch {
    /* catalog entry still has the field */
  }

  await kv.put(assignmentKey(id), JSON.stringify(assignment));
  await kv.put(catalogKey(id), JSON.stringify(catalogEntry));
  await upsertCatalogEntriesBlob(kv, catalogEntry);

  const index = await readIndex(kv);
  const updated = index.includes(id);
  if (!updated) {
    index.unshift(id);
    await writeIndex(kv, index);
  }

  return { id, updated };
}

/** Remove a teacher-saved worksheet from KV (library / published copies). */
export async function deleteWorksheetFromLibrary(
  data: DeleteWorksheetPayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.worksheetId || "").trim();
  if (!id) throw new Error("ID_REQUIRED");
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("INVALID_ID");

  const hasCatalog = await kv.get(catalogKey(id));
  const hasAssignment = await kv.get(assignmentKey(id));
  if (!hasCatalog && !hasAssignment) throw new Error("NOT_IN_LIBRARY");

  await kv.delete(catalogKey(id));
  await kv.delete(assignmentKey(id));
  await removeCatalogEntriesBlob(kv, id);

  const index = await readIndex(kv);
  await writeIndex(
    kv,
    index.filter((entry) => entry !== id)
  );

  const allStudents = await listAllStudentAccounts(kv);
  for (const { username: student } of allStudents) {
    const current = await kv.get(studentCurrentHomeworkKey(student));
    if (current === id) await kv.delete(studentCurrentHomeworkKey(student));
    const waiting = await readHomeworkWaitingQueue(kv, student);
    if (waiting.includes(id)) {
      await writeHomeworkWaitingQueue(
        kv,
        student,
        waiting.filter((entry) => entry !== id)
      );
    }
  }

  return { id };
}

export async function loadPublishedCatalogEntries(kv: KVNamespace): Promise<Record<string, unknown>[]> {
  const cached = await readCatalogEntriesBlob(kv);
  if (cached) return cached;

  const rebuilt = await rebuildCatalogEntriesFromIndex(kv);
  try {
    await writeCatalogEntriesBlob(kv, rebuilt);
  } catch {
    /* list still works if snapshot write fails */
  }
  return rebuilt;
}

export async function loadPublishedAssignment(
  kv: KVNamespace,
  id: string
): Promise<Record<string, unknown> | null> {
  for (const key of assignmentIdLookupKeys(id)) {
    const raw = await kv.get(assignmentKey(key));
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      let { assignment, repaired } = repairAssignmentRecord(parsed);
      const canonicalId = normalizeAssignmentId(String(assignment.id || key));
      if (assignment.id !== canonicalId) {
        assignment.id = canonicalId;
        repaired = true;
      }
      if (repaired) {
        await kv.put(assignmentKey(key), JSON.stringify(assignment));
      }
      return assignment;
    } catch {
      continue;
    }
  }
  return null;
}

export async function getStudentYoutube(kv: KVNamespace, username: string): Promise<string | null> {
  return kv.get(studentYoutubeKey(username.toLowerCase()));
}

export async function getStudentLessonPlaylist(
  kv: KVNamespace,
  username: string
): Promise<string | null> {
  return kv.get(studentLessonPlaylistKey(username.toLowerCase()));
}

async function readConfirmedPlaylistLatest(
  kv: KVNamespace,
  student: string,
  playlistId: string
): Promise<{ url: string; title: string } | null> {
  const raw = await kv.get(playlistLatestConfirmedKey(student.toLowerCase(), playlistId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { url?: string; title?: string };
    const url = String(parsed.url || "").trim();
    if (!url) return null;
    return { url, title: String(parsed.title || "").trim() };
  } catch {
    return null;
  }
}

async function resolveLatestLessonFromPlaylist(
  kv: KVNamespace | undefined,
  student: string,
  playlistUrl: string,
  bustCache = false,
  allowLiveFetch = true
): Promise<{ url: string; title: string; dated: boolean } | null> {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    /* Teacher pasted a single video into the playlist field — still enable Latest lesson. */
    const videoId = extractVideoId(playlistUrl);
    return videoId ? { url: `https://youtu.be/${videoId}`, title: "", dated: true } : null;
  }

  const user = student.toLowerCase();
  const cacheKey = playlistLatestCacheKey(user, playlistId);
  const confirmedKey = playlistLatestConfirmedKey(user, playlistId);

  if (kv && !bustCache) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { url?: string; title?: string; dated?: boolean };
        const url = String(parsed.url || "").trim();
        const title = String(parsed.title || "").trim();
        if (url && parsed.dated !== false && title) return { url, title, dated: true };
        if (url && parsed.dated !== false && !title) {
          /* Old cache row with no title — refetch once so the hub can show it. */
        } else if (url && parsed.dated === false) {
          const confirmed = await readConfirmedPlaylistLatest(kv, user, playlistId);
          if (confirmed) return { ...confirmed, dated: true };
          return { url, title, dated: false };
        }
      } catch {
        /* refresh */
      }
    }
  }

  if (!allowLiveFetch) {
    return kv ? readConfirmedPlaylistLatest(kv, user, playlistId) : null;
  }

  const latest = await fetchLatestVideoFromPlaylist(playlistId);
  if (!latest) {
    return kv ? readConfirmedPlaylistLatest(kv, user, playlistId) : null;
  }

  const title = String(latest.title || "").trim();
  if (kv) {
    if (latest.dated) {
      const payload = JSON.stringify({
        url: latest.url,
        videoId: latest.videoId,
        playlistId,
        dated: true,
        title,
      });
      await kv.put(cacheKey, payload, { expirationTtl: PLAYLIST_LATEST_TTL_SEC });
      await kv.put(confirmedKey, payload);
      return { url: latest.url, title, dated: true };
    }

    /* YouTube blocked date reads — keep last confirmed newest, don't cache a bad guess. */
    const confirmed = await readConfirmedPlaylistLatest(kv, user, playlistId);
    if (confirmed) return { ...confirmed, dated: true };

    await kv.put(
      cacheKey,
      JSON.stringify({
        url: latest.url,
        videoId: latest.videoId,
        playlistId,
        dated: false,
        title,
      }),
      { expirationTtl: Math.min(PLAYLIST_LATEST_TTL_SEC, 600) }
    );
  }
  return { url: latest.url, title, dated: latest.dated };
}

async function enrichProfileWithPlaylistLatest(
  kv: KVNamespace | undefined,
  student: string,
  profile: NonNullable<CatalogFile["studentProfiles"]>[string],
  opts?: { allowLiveFetch?: boolean }
): Promise<NonNullable<CatalogFile["studentProfiles"]>[string]> {
  const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
  if (!playlistUrl) return profile;

  const fromPlaylist = await resolveLatestLessonFromPlaylist(
    kv,
    student,
    playlistUrl,
    false,
    opts?.allowLiveFetch !== false
  );
  if (!fromPlaylist) return profile;

  const savedUrl = String(profile.latestLessonUrl || profile.youtubeUrl || "").trim();
  const savedTitle = String(profile.latestLessonTitle || "").trim();
  /* A dateless guess is the end of the playlist, often the oldest lesson.
     Keep the saved lesson until YouTube gives a real upload date. */
  if (!fromPlaylist.dated && savedUrl) return profile;

  const sameVideo =
    savedUrl &&
    fromPlaylist.url.replace(/\/$/, "") === savedUrl.replace(/\/$/, "");
  return {
    ...profile,
    latestLessonUrl: fromPlaylist.url,
    youtubeUrl: fromPlaylist.url,
    latestLessonTitle: fromPlaylist.title || (sameVideo ? savedTitle : ""),
  };
}

function cloneAssignmentForTrialStudent(
  entry: Record<string, unknown>,
  studentKey: string
): Record<string, unknown> {
  const students = Array.isArray(entry.students)
    ? entry.students.map((s) => String(s))
    : [];
  const nextStudents = students.some((s) => s.toLowerCase() === studentKey)
    ? students
    : [...students, studentKey];
  return { ...entry, students: nextStudents };
}

/**
 * Trial access is the stored UTC end time plus an unpaid pending account.
 * A confirmed PayPal payment or a real lesson-student label is left alone.
 */
async function readCurriculumTrialGrant(kv: KVNamespace, username: string) {
  const account = await getUserAccount(username, { HOMEWORK_KV: kv });
  const endsAt = String(account?.curriculumTrialEndsAt || "").trim();
  if (!account || !endsAt || curriculumTrialEndsMs(endsAt) === null) return null;
  const baseLabel = account.accountLabel || "homework_only";
  const baseTier = account.tier || "pending";
  return {
    endsAt,
    baseLabel,
    baseTier,
    homeworkId: CURRICULUM_TRIAL_HOMEWORK_ID,
    grantAccess: account.paypalPaid !== true && isCurriculumTrialActive(endsAt),
  };
}

async function studentReallyHasAssignment(
  kv: KVNamespace,
  username: string,
  assignmentId: string
): Promise<boolean> {
  const current = String((await kv.get(studentCurrentHomeworkKey(username))) || "").trim();
  if (current === assignmentId) return true;
  const waiting = await readHomeworkWaitingQueue(kv, username);
  if (waiting.includes(assignmentId)) return true;
  const catalogRaw = await kv.get(catalogKey(assignmentId));
  if (!catalogRaw) return false;
  try {
    const entry = JSON.parse(catalogRaw) as { students?: unknown[] };
    return (entry.students || [])
      .map((s) => String(s || "").toLowerCase())
      .includes(username);
  } catch {
    return false;
  }
}

/** After the trial instant, the trial sheet is not homework access for this account. */
async function assertCurriculumTrialHomeworkAccess(
  kv: KVNamespace,
  username: string,
  assignmentId: string
): Promise<void> {
  if (assignmentId !== CURRICULUM_TRIAL_HOMEWORK_ID) return;
  const trial = await readCurriculumTrialGrant(kv, username);
  if (!trial) return;
  if (trial.grantAccess) return;
  if (await studentReallyHasAssignment(kv, username, assignmentId)) return;
  throw new Error("CURRICULUM_TRIAL_ENDED");
}

export interface MergeCatalogOptions {
  /** Student hub: only enrich this learner — skips full roster (still resolves their playlist → latest lesson). */
  student?: string;
}

type StudentProfile = NonNullable<CatalogFile["studentProfiles"]>[string];

async function applyKvStudentMedia(
  kvNs: KVNamespace,
  key: string,
  base: StudentProfile
): Promise<StudentProfile | null> {
  const [yt, playlist] = await Promise.all([
    getStudentYoutube(kvNs, key),
    getStudentLessonPlaylist(kvNs, key),
  ]);
  let next: StudentProfile = { ...base };
  if (playlist) {
    next = { ...next, lessonPlaylistUrl: playlist };
  }
  if (yt) {
    next = { ...next, latestLessonUrl: yt, youtubeUrl: yt };
  }
  if (yt || playlist || base.lessonPlaylistUrl) return next;
  return null;
}

function assignmentIncludesStudent(
  entry: Record<string, unknown>,
  studentKey: string
): boolean {
  const students = (entry.students as string[]) || [];
  return students.some((s) => String(s).toLowerCase() === studentKey);
}

export async function mergeCatalog(
  staticCatalog: CatalogFile,
  kv: KVNamespace | undefined,
  opts?: MergeCatalogOptions
): Promise<CatalogFile> {
  const published = kv ? await loadPublishedCatalogEntries(kv) : [];
  const staticAssignments = staticCatalog.assignments || [];
  const byId = new Map<string, Record<string, unknown>>();

  staticAssignments.forEach((e) => {
    if (e?.id) byId.set(String(e.id), e);
  });
  published.forEach((e) => {
    if (e?.id) byId.set(String(e.id), e);
  });

  const studentKey = String(opts?.student || "")
    .trim()
    .toLowerCase();
  let assignments = [...byId.values()];
  if (studentKey) {
    assignments = assignments.filter((e) => assignmentIncludesStudent(e, studentKey));
  }

  if (kv) {
    const catMap = await readWsCategoryMap(kv);
    assignments = assignments.map((e) => ({
      ...e,
      wsCategory: resolveWsCategory(e, catMap),
    }));
  } else {
    assignments = assignments.map((e) => ({
      ...e,
      wsCategory: resolveWsCategory(e),
    }));
  }

  const merged: CatalogFile = {
    ...staticCatalog,
    assignments,
  };

  if (!kv) return merged;

  const kvNs = kv;

  if (studentKey) {
    const base = staticCatalog.studentProfiles?.[studentKey] || {};
    merged.studentProfiles = { [studentKey]: { ...base } };

    const media = await applyKvStudentMedia(kvNs, studentKey, base);
    if (media) merged.studentProfiles[studentKey] = media;

    const currentHomeworkId = String(
      (await kvNs.get(studentCurrentHomeworkKey(studentKey))) || ""
    ).trim();
    const waitingHomeworkIds = await readHomeworkWaitingQueue(kvNs, studentKey);
    if (currentHomeworkId || waitingHomeworkIds.length) {
      merged.studentProfiles[studentKey] = {
        ...(merged.studentProfiles[studentKey] || {}),
        ...(currentHomeworkId ? { currentHomeworkId } : {}),
        ...(waitingHomeworkIds.length ? { waitingHomeworkIds } : {}),
      };
    }

    const trial = await readCurriculumTrialGrant(kvNs, studentKey);
    if (trial?.grantAccess) {
      const sheet = byId.get(CURRICULUM_TRIAL_HOMEWORK_ID);
      if (
        sheet &&
        !assignments.some((entry) => String(entry.id || "") === CURRICULUM_TRIAL_HOMEWORK_ID)
      ) {
        assignments = [...assignments, cloneAssignmentForTrialStudent(sheet, studentKey)];
        merged.assignments = assignments;
      }
      const trialProfile = merged.studentProfiles[studentKey] || {};
      if (!String(trialProfile.currentHomeworkId || "").trim()) {
        merged.studentProfiles[studentKey] = {
          ...trialProfile,
          currentHomeworkId: CURRICULUM_TRIAL_HOMEWORK_ID,
        };
      }
      const withHomework = merged.studentProfiles[studentKey] || {};
      if (!String(withHomework.lessonPlaylistUrl || "").trim()) {
        const lessonMedia = staticCatalog.studentProfiles?.christian;
        const lessonPlaylistUrl = String(lessonMedia?.lessonPlaylistUrl || "").trim();
        const reviewPlaylistUrl = String(
          lessonMedia?.reviewPlaylistUrl || lessonPlaylistUrl
        ).trim();
        if (lessonPlaylistUrl) {
          merged.studentProfiles[studentKey] = {
            ...withHomework,
            lessonPlaylistUrl,
            ...(reviewPlaylistUrl ? { reviewPlaylistUrl } : {}),
          };
        }
      }
    }

    const profile = merged.studentProfiles[studentKey] || {};
    const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
    if (playlistUrl) {
      /* Playlist wins over any frozen student:youtube override. */
      const enriched = await enrichProfileWithPlaylistLatest(kvNs, studentKey, profile, {
        allowLiveFetch: true,
      });
      if (enriched.latestLessonUrl) {
        merged.studentProfiles[studentKey] = enriched;
      } else {
        const manualYt = await getStudentYoutube(kvNs, studentKey);
        if (manualYt) {
          merged.studentProfiles[studentKey] = {
            ...profile,
            latestLessonUrl: manualYt,
            youtubeUrl: manualYt,
          };
        }
      }
    }

    return merged;
  }

  merged.studentProfiles = { ...(staticCatalog.studentProfiles || {}) };

  const studentKeys = new Set<string>();
  for (const user of Object.keys(staticCatalog.studentProfiles || {})) {
    studentKeys.add(user.toLowerCase());
  }
  for (const entry of published) {
    for (const user of (entry.students as string[]) || []) {
      studentKeys.add(String(user).toLowerCase());
    }
  }

  await Promise.all(
    [...studentKeys].map(async (key) => {
      const base = merged.studentProfiles![key] || {};
      const media = await applyKvStudentMedia(kvNs, key, base);
      if (media) merged.studentProfiles![key] = media;
    })
  );

  const allStudents = await listAllStudentAccounts(kvNs);
  merged.students = allStudents;

  await Promise.all(
    allStudents.map(async ({ username: student }) => {
      const currentHomeworkId = String(
        (await kvNs.get(studentCurrentHomeworkKey(student))) || ""
      ).trim();
      const waitingHomeworkIds = await readHomeworkWaitingQueue(kvNs, student);
      if (!currentHomeworkId && !waitingHomeworkIds.length) return;
      merged.studentProfiles![student] = {
        ...(merged.studentProfiles![student] || {}),
        ...(currentHomeworkId ? { currentHomeworkId } : {}),
        ...(waitingHomeworkIds.length ? { waitingHomeworkIds } : {}),
      };
    })
  );

  await Promise.all(
    Object.entries(merged.studentProfiles || {}).map(async ([key, profile]) => {
      const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
      if (!playlistUrl) return;

      const enriched = await enrichProfileWithPlaylistLatest(kvNs, key, profile, {
        allowLiveFetch: true,
      });
      if (enriched.latestLessonUrl) {
        merged.studentProfiles![key] = enriched;
        return;
      }

      const manualYt = await getStudentYoutube(kvNs, key);
      if (manualYt) {
        merged.studentProfiles![key] = {
          ...profile,
          latestLessonUrl: manualYt,
          youtubeUrl: manualYt,
        };
      }
    })
  );

  return merged;
}

/** Teacher ideas / memos (private notes, searchable). */

const IDEAS_INDEX = "teacher-ideas-index";
const IDEAS_CUSTOM_TAGS = "teacher-ideas-custom-tags";
const ideaKey = (id: string) => `teacher-idea:${id}`;
const ideaAssetKey = (id: string) => `teacher-idea-asset:${id}`;
const ideaAssetMetaKey = (id: string) => `teacher-idea-asset-meta:${id}`;

const IDEA_IMAGE_MAX_COUNT = 12;
const IDEA_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IDEA_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

interface IdeaAssetMeta {
  mimeType: string;
  name?: string;
  size: number;
  createdAt: string;
}

export const DEFAULT_IDEA_TAGS = ["lesson", "media", "website", "game", "hw"] as const;
/** @deprecated use DEFAULT_IDEA_TAGS */
export const TEACHER_IDEA_TAGS = DEFAULT_IDEA_TAGS;

export interface TeacherIdeaImage {
  id: string;
  name?: string;
  mimeType: string;
}

export interface TeacherIdea {
  id: string;
  text: string;
  tags: string[];
  images?: TeacherIdeaImage[];
  createdAt: string;
  updatedAt: string;
}

export interface TeacherIdeaPayload {
  teacherUsername?: string;
  id?: string;
  text?: string;
  tags?: string[];
  images?: TeacherIdeaImage[];
}

export interface TeacherIdeaImageDeletePayload {
  teacherUsername?: string;
  id?: string;
}

export interface TeacherIdeaDeletePayload {
  teacherUsername?: string;
  id?: string;
}

export interface TeacherIdeaTagPayload {
  teacherUsername?: string;
  tag?: string;
}

async function readIdeasIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(IDEAS_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writeIdeasIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(IDEAS_INDEX, JSON.stringify(unique));
}

const IDEA_TAG_MAX_LEN = 24;
const IDEA_TAG_MAX_COUNT = 12;

export function slugifyIdeaTag(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, IDEA_TAG_MAX_LEN);
}

async function readCustomIdeaTags(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(IDEAS_CUSTOM_TAGS);
  if (!raw) return [];
  try {
    const tags = JSON.parse(raw) as string[];
    if (!Array.isArray(tags)) return [];
    return tags.map(slugifyIdeaTag).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeCustomIdeaTags(kv: KVNamespace, tags: string[]): Promise<void> {
  const defaults = new Set(DEFAULT_IDEA_TAGS);
  const unique: string[] = [];
  for (const tag of tags) {
    const slug = slugifyIdeaTag(tag);
    if (!slug || defaults.has(slug as (typeof DEFAULT_IDEA_TAGS)[number])) continue;
    if (!unique.includes(slug)) unique.push(slug);
  }
  unique.sort();
  await kv.put(IDEAS_CUSTOM_TAGS, JSON.stringify(unique));
}

async function registerCustomIdeaTags(kv: KVNamespace, tags: string[]): Promise<void> {
  const existing = await readCustomIdeaTags(kv);
  const merged = [...existing];
  let changed = false;
  for (const tag of tags) {
    const slug = slugifyIdeaTag(tag);
    if (!slug) continue;
    if ((DEFAULT_IDEA_TAGS as readonly string[]).includes(slug)) continue;
    if (!merged.includes(slug)) {
      merged.push(slug);
      changed = true;
    }
  }
  if (changed) await writeCustomIdeaTags(kv, merged);
}

async function listKnownIdeaTags(kv: KVNamespace): Promise<string[]> {
  const custom = await readCustomIdeaTags(kv);
  const known = new Set([...DEFAULT_IDEA_TAGS, ...custom]);
  return [...known].sort();
}

function normalizeIdeaTags(tags: string[] | undefined, knownTags: Set<string>): string[] {
  const out: string[] = [];
  for (const tag of tags || []) {
    const slug = slugifyIdeaTag(tag);
    if (!slug || !knownTags.has(slug)) continue;
    if (!out.includes(slug)) out.push(slug);
    if (out.length >= IDEA_TAG_MAX_COUNT) break;
  }
  return out;
}

export async function listTeacherIdeaTags(env: KvEnv): Promise<string[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  return listKnownIdeaTags(kv);
}

export async function listCustomTeacherIdeaTags(env: KvEnv): Promise<string[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  return readCustomIdeaTags(kv);
}

export async function addTeacherIdeaTag(
  data: TeacherIdeaTagPayload,
  env: KvEnv
): Promise<{ tag: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const slug = slugifyIdeaTag(String(data.tag || ""));
  if (!slug) throw new Error("TAG_INVALID");
  if ((DEFAULT_IDEA_TAGS as readonly string[]).includes(slug)) {
    return { tag: slug };
  }

  const existing = await readCustomIdeaTags(kv);
  if (!existing.includes(slug)) {
    await writeCustomIdeaTags(kv, [...existing, slug]);
  }
  return { tag: slug };
}

export async function deleteTeacherIdeaTag(
  data: TeacherIdeaTagPayload,
  env: KvEnv
): Promise<{ tag: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const slug = slugifyIdeaTag(String(data.tag || ""));
  if (!slug) throw new Error("TAG_INVALID");
  if ((DEFAULT_IDEA_TAGS as readonly string[]).includes(slug)) {
    throw new Error("TAG_DEFAULT");
  }

  const existing = await readCustomIdeaTags(kv);
  if (!existing.includes(slug)) throw new Error("NOT_FOUND");

  await writeCustomIdeaTags(
    kv,
    existing.filter((entry) => entry !== slug)
  );

  const now = new Date().toISOString();
  const ids = await readIdeasIndex(kv);
  for (const id of ids) {
    const raw = await kv.get(ideaKey(id));
    if (!raw) continue;
    let idea: TeacherIdea;
    try {
      idea = JSON.parse(raw) as TeacherIdea;
    } catch {
      continue;
    }
    if (!(idea.tags || []).includes(slug)) continue;
    idea.tags = idea.tags.filter((entry) => entry !== slug);
    idea.updatedAt = now;
    await kv.put(ideaKey(id), JSON.stringify(idea));
  }

  return { tag: slug };
}

function makeIdeaAssetId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `img-${Date.now()}-${rand}`;
}

async function readIdeaAssetMeta(kv: KVNamespace, id: string): Promise<IdeaAssetMeta | null> {
  const raw = await kv.get(ideaAssetMetaKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdeaAssetMeta;
  } catch {
    return null;
  }
}

async function deleteIdeaAsset(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(ideaAssetKey(id));
  await kv.delete(ideaAssetMetaKey(id));
}

async function deleteIdeaAssets(kv: KVNamespace, images: TeacherIdeaImage[] | undefined): Promise<void> {
  for (const image of images || []) {
    if (image?.id) await deleteIdeaAsset(kv, image.id);
  }
}

function normalizeIdeaImages(
  images: TeacherIdeaImage[] | undefined,
  knownAssetIds: Set<string>
): TeacherIdeaImage[] {
  const out: TeacherIdeaImage[] = [];
  for (const image of images || []) {
    const id = String(image?.id || "").trim();
    const mimeType = String(image?.mimeType || "").trim().toLowerCase();
    if (!id || !knownAssetIds.has(id) || !IDEA_IMAGE_TYPES.has(mimeType)) continue;
    if (out.some((entry) => entry.id === id)) continue;
    out.push({
      id,
      mimeType,
      name: String(image.name || "").trim() || undefined,
    });
    if (out.length >= IDEA_IMAGE_MAX_COUNT) break;
  }
  return out;
}

export async function uploadTeacherIdeaImage(
  teacherUsername: string | undefined,
  file: File,
  env: KvEnv
): Promise<{ id: string; mimeType: string; name?: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const mimeType = String(file.type || "").trim().toLowerCase();
  if (!IDEA_IMAGE_TYPES.has(mimeType)) throw new Error("IMAGE_TYPE");
  if (file.size > IDEA_IMAGE_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const id = makeIdeaAssetId();
  const buffer = await file.arrayBuffer();
  const meta: IdeaAssetMeta = {
    mimeType,
    name: String(file.name || "").trim() || undefined,
    size: buffer.byteLength,
    createdAt: new Date().toISOString(),
  };

  await kv.put(ideaAssetKey(id), buffer);
  await kv.put(ideaAssetMetaKey(id), JSON.stringify(meta));

  return { id, mimeType, name: meta.name };
}

export async function loadTeacherIdeaImage(
  teacherUsername: string | undefined,
  assetId: string,
  env: KvEnv
): Promise<{ body: ArrayBuffer; mimeType: string } | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(assetId || "").trim();
  if (!id) return null;

  const meta = await readIdeaAssetMeta(kv, id);
  const body = await kv.get(ideaAssetKey(id), "arrayBuffer");
  if (!body || !meta) return null;

  return { body, mimeType: meta.mimeType };
}

export async function deleteTeacherIdeaImage(
  data: TeacherIdeaImageDeletePayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.id || "").trim();
  if (!id) throw new Error("ID_REQUIRED");

  const meta = await readIdeaAssetMeta(kv, id);
  if (!meta) throw new Error("NOT_FOUND");

  await deleteIdeaAsset(kv, id);
  return { id };
}

/** Worksheet prompt images (open-response screenshots, etc.) — public read by id. */

const worksheetImageKey = (id: string) => `worksheet-image:${id}`;
const worksheetImageMetaKey = (id: string) => `worksheet-image-meta:${id}`;
const WORKSHEET_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const WORKSHEET_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function makeWorksheetImageId(): string {
  return "wimg-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function saveWorksheetPromptImage(
  teacherUsername: string | undefined,
  file: File,
  env: KvEnv
): Promise<{ id: string; mimeType: string; name?: string; urlPath: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(teacherUsername, env)) throw new Error("TEACHER_ONLY");
  return storeWorksheetPromptImage(kv, file);
}

/** Student (or teacher) worksheet image upload — known account required. */
export async function saveStudentWorksheetImage(
  studentUsername: string | undefined,
  file: File,
  env: KvEnv
): Promise<{ id: string; mimeType: string; name?: string; urlPath: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const username = String(studentUsername || "")
    .trim()
    .toLowerCase();
  if (!username) throw new Error("STUDENT_REQUIRED");
  if (!(await isKnownStudentInKv(username, kv)) && !isTeacher(username, env)) {
    throw new Error("UNKNOWN_STUDENT");
  }
  return storeWorksheetPromptImage(kv, file);
}

async function storeWorksheetPromptImage(
  kv: KVNamespace,
  file: File
): Promise<{ id: string; mimeType: string; name?: string; urlPath: string }> {
  const mimeType = String(file.type || "").trim().toLowerCase();
  if (!WORKSHEET_IMAGE_TYPES.has(mimeType)) throw new Error("IMAGE_TYPE");
  if (file.size > WORKSHEET_IMAGE_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const id = makeWorksheetImageId();
  const buffer = await file.arrayBuffer();
  const meta = {
    mimeType,
    name: String(file.name || "").trim() || undefined,
    size: buffer.byteLength,
    createdAt: new Date().toISOString(),
  };

  await kv.put(worksheetImageKey(id), buffer);
  await kv.put(worksheetImageMetaKey(id), JSON.stringify(meta));

  return {
    id,
    mimeType,
    name: meta.name,
    urlPath: "/api/hw-img/" + encodeURIComponent(id),
  };
}

export async function loadWorksheetPromptImage(
  imageId: string,
  env: KvEnv
): Promise<{ body: ArrayBuffer; mimeType: string } | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const id = String(imageId || "").trim();
  if (!id) return null;

  const metaRaw = await kv.get(worksheetImageMetaKey(id));
  const body = await kv.get(worksheetImageKey(id), "arrayBuffer");
  if (!metaRaw || !body) return null;

  try {
    const meta = JSON.parse(metaRaw) as { mimeType?: string };
    return { body, mimeType: meta.mimeType || "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function listTeacherIdeas(env: KvEnv): Promise<TeacherIdea[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const ids = await readIdeasIndex(kv);
  const ideas: TeacherIdea[] = [];
  for (const id of ids) {
    const raw = await kv.get(ideaKey(id));
    if (!raw) continue;
    try {
      ideas.push(JSON.parse(raw) as TeacherIdea);
    } catch {
      /* skip corrupt */
    }
  }
  return ideas;
}

export async function saveTeacherIdea(
  data: TeacherIdeaPayload,
  env: KvEnv
): Promise<{ id: string; updated: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const text = String(data.text || "").trim();
  const incomingImages = Array.isArray(data.images) ? data.images : [];
  const assetIds = new Set<string>();
  for (const image of incomingImages) {
    const assetId = String(image?.id || "").trim();
    if (!assetId) continue;
    const meta = await readIdeaAssetMeta(kv, assetId);
    if (meta) assetIds.add(assetId);
  }
  const images = normalizeIdeaImages(incomingImages, assetIds);
  if (!text && !images.length) throw new Error("CONTENT_REQUIRED");

  const incoming = (data.tags || []).map(slugifyIdeaTag).filter(Boolean);
  await registerCustomIdeaTags(kv, incoming);
  const known = new Set(await listKnownIdeaTags(kv));
  const tags = normalizeIdeaTags(incoming, known);
  const now = new Date().toISOString();
  const existingId = String(data.id || "").trim();
  let id = existingId;
  let updated = false;

  if (id) {
    const raw = await kv.get(ideaKey(id));
    if (!raw) throw new Error("NOT_FOUND");
    let prev: TeacherIdea;
    try {
      prev = JSON.parse(raw) as TeacherIdea;
    } catch {
      throw new Error("NOT_FOUND");
    }
    const keepIds = new Set(images.map((image) => image.id));
    const removed = (prev.images || []).filter((image) => !keepIds.has(image.id));
    await deleteIdeaAssets(kv, removed);

    const idea: TeacherIdea = {
      ...prev,
      text,
      tags,
      images,
      updatedAt: now,
    };
    await kv.put(ideaKey(id), JSON.stringify(idea));
    updated = true;
  } else {
    id = `idea-${Date.now()}`;
    const idea: TeacherIdea = {
      id,
      text,
      tags,
      images,
      createdAt: now,
      updatedAt: now,
    };
    await kv.put(ideaKey(id), JSON.stringify(idea));
    const index = await readIdeasIndex(kv);
    index.unshift(id);
    await writeIdeasIndex(kv, index);
  }

  return { id, updated };
}

export async function deleteTeacherIdea(
  data: TeacherIdeaDeletePayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.id || "").trim();
  if (!id) throw new Error("ID_REQUIRED");

  const raw = await kv.get(ideaKey(id));
  if (raw) {
    try {
      const idea = JSON.parse(raw) as TeacherIdea;
      await deleteIdeaAssets(kv, idea.images);
    } catch {
      /* continue */
    }
  }

  await kv.delete(ideaKey(id));
  const index = await readIdeasIndex(kv);
  await writeIdeasIndex(
    kv,
    index.filter((entry) => entry !== id)
  );

  return { id };
}

/** Student homework submissions (online answers + printed photos). */

const SUBMISSIONS_INDEX = "submissions-index";
const submissionKey = (id: string) => `submission:${id}`;
const studentSubmissionsIndexKey = (username: string) =>
  `submissions-by-student:${String(username || "")
    .trim()
    .toLowerCase()}`;
const submissionPhotoKey = (id: string) => `submission-photo:${id}`;
const submissionPhotoMetaKey = (id: string) => `submission-photo-meta:${id}`;
const submissionVideoKey = (id: string) => `submission-video:${id}`;
const submissionVideoMetaKey = (id: string) => `submission-video-meta:${id}`;

const SUBMISSION_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const SUBMISSION_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SUBMISSION_VIDEO_MAX_BYTES = 24 * 1024 * 1024;
const SUBMISSION_VIDEO_TYPES = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
]);

export interface HomeworkAnswerRow {
  label?: string;
  prompt?: string;
  student?: string;
  expected?: string;
  correct?: boolean;
  completed?: string;
  progress?: string;
  blockType?: string;
  question?: string;
  piecesDisplay?: string;
  reference?: string;
  staticDisplay?: string;
  prefix?: string;
  suffix?: string;
  mediaId?: string;
  mediaKind?: "video" | "audio" | "image";
  /** Student- or teacher-attached image URL (e.g. /api/hw-img/…). */
  imageUrl?: string;
}

export interface HomeworkSubmissionPhoto {
  id: string;
  mimeType: string;
  name?: string;
}

export interface HomeworkSubmissionVideo {
  id: string;
  mimeType: string;
  name?: string;
}

export interface HomeworkReviewMedia {
  id: string;
  kind: "audio" | "video";
  mimeType?: string;
}

export interface HomeworkComment {
  id: string;
  text: string;
  /** Who authored the cloud / question note. Defaults to student when omitted (legacy). */
  author?: "student" | "teacher";
  /** JD reply attached to a student memo. */
  teacherRemark?: string;
  /** JD audio/video reply attached to a student memo (or teacher note). */
  teacherRemarkMedia?: HomeworkReviewMedia;
  anchor?: string;
  anchorRect?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  /** Which homework question slide (0-based) this note belongs to. */
  slideIndex?: number;
  x?: number;
  y?: number;
  createdAt: string;
  updatedAt?: string;
}

export type HomeworkReviewStatus = "submitted" | "reviewed" | "acknowledged";

/** JD mark on a whole question slide (0-based index as string). */
export type HomeworkQuestionMark = "correct" | "wrong";

export function normalizeQuestionMarks(
  raw: unknown
): Record<string, HomeworkQuestionMark> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, HomeworkQuestionMark> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx > 200) continue;
    if (value === "correct" || value === "wrong") out[String(idx)] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** One Notebook list row: student memo + JD reply, or a standalone JD question note. */
export interface HomeworkNotebookRow {
  id: string;
  kind: "pair" | "jd" | "mark";
  studentText?: string;
  studentAnchor?: string;
  /** Worksheet answer for this slide (when available) — preferred over empty memo placeholders. */
  studentAnswer?: string;
  jdText?: string;
  /** True when JD left A/V without (or in addition to) text — text-first MVP. */
  hasJdMedia?: boolean;
  /** Media refs so the hub can play Video/Audio without opening the worksheet. */
  jdMedia?: HomeworkReviewMedia;
  slideIndex?: number;
  commentId: string;
  /** Deck “Looks good” / “Not quite” mark for this slide, when present. */
  questionMark?: HomeworkQuestionMark;
}

/**
 * Snapshot of review note-pairs saved when teacher submits notes.
 * Stored on the submission so student hub can list without re-deriving every time.
 */
export interface HomeworkNotebookPack {
  savedAt: string;
  submissionId: string;
  assignmentId: string;
  title?: string;
  lessonName?: string;
  /** Student display name for Notebook column headers. */
  displayName?: string;
  reviewedAt: string;
  rows: HomeworkNotebookRow[];
  /** Per-question looks-good / not-quite marks from the review deck. */
  questionMarks?: Record<string, HomeworkQuestionMark>;
}

export interface HomeworkSubmission {
  id: string;
  type: "online" | "photo" | "video";
  username: string;
  displayName: string;
  assignmentId: string;
  lessonName?: string;
  title?: string;
  register?: string;
  scoreCorrect?: number;
  scoreTotal?: number;
  section1?: HomeworkAnswerRow[];
  section2?: HomeworkAnswerRow[];
  listening?: HomeworkAnswerRow[];
  /** Worksheet-order answers (matches Discord checker layout). */
  answers?: HomeworkAnswerRow[];
  /** Student notes / questions on the worksheet at submit time (+ teacher remarks after review). */
  comments?: HomeworkComment[];
  /** Auto-saved when teacher Submit notes marks the submission reviewed. */
  notebook?: HomeworkNotebookPack;
  photo?: HomeworkSubmissionPhoto;
  video?: HomeworkSubmissionVideo;
  submittedAt: string;
  /** After student submit; becomes reviewed when teacher submits notes; acknowledged when student finishes reading. */
  reviewStatus?: HomeworkReviewStatus;
  reviewedAt?: string;
  teacherNotesSubmittedAt?: string;
  /** When the student marks JD’s notes as done / ready for new HW. */
  studentNotesAckedAt?: string;
  /** Per-question looks-good / not-quite marks, keyed by slide index. */
  questionMarks?: Record<string, HomeworkQuestionMark>;
}

export interface HomeworkReviewSaveInput {
  teacherUsername?: string;
  submissionId?: string;
  comments?: HomeworkComment[];
  markReviewed?: boolean;
  questionMarks?: Record<string, HomeworkQuestionMark>;
}

export interface HomeworkReviewAckInput {
  username?: string;
  submissionId?: string;
}

export interface HomeworkOnlineSubmitInput {
  username?: string;
  displayName?: string;
  assignmentId?: string;
  lessonName?: string;
  title?: string;
  register?: string;
  scoreCorrect?: number;
  scoreTotal?: number;
  section1?: HomeworkAnswerRow[];
  section2?: HomeworkAnswerRow[];
  listening?: HomeworkAnswerRow[];
  answers?: HomeworkAnswerRow[];
  comments?: HomeworkComment[];
}

export interface HomeworkPhotoSubmitInput {
  username?: string;
  displayName?: string;
  assignmentId?: string;
  lessonName?: string;
}

export interface HomeworkVideoSubmitInput {
  username?: string;
  displayName?: string;
  assignmentId?: string;
  lessonName?: string;
}

export async function isKnownStudent(
  username: string | undefined,
  env: KvEnv
): Promise<boolean> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return false;
  return isKnownStudentInKv(username, kv);
}

async function isKnownStudentInKv(
  username: string | undefined,
  kv: KVNamespace
): Promise<boolean> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return false;
  const wiped = await readWipedStudents(kv);
  if (wiped.has(user)) {
    const account = await kv.get(userAccountKey(user));
    return Boolean(account);
  }
  if (STUDENT_ACCOUNTS.has(user)) return true;
  const account = await kv.get(userAccountKey(user));
  return Boolean(account);
}

function makeSubmissionId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `sub-${Date.now()}-${rand}`;
}

function makeSubmissionPhotoId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `subimg-${Date.now()}-${rand}`;
}

function makeSubmissionVideoId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `subvid-${Date.now()}-${rand}`;
}

async function readSubmissionsIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(SUBMISSIONS_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writeSubmissionsIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(SUBMISSIONS_INDEX, JSON.stringify(unique));
}

/** null = index never built; [] = student has no submissions yet. */
async function readStudentSubmissionsIndex(
  kv: KVNamespace,
  username: string
): Promise<string[] | null> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return [];
  const raw = await kv.get(studentSubmissionsIndexKey(user));
  if (raw == null) return null;
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function writeStudentSubmissionsIndex(
  kv: KVNamespace,
  username: string,
  ids: string[]
): Promise<void> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return;
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(studentSubmissionsIndexKey(user), JSON.stringify(unique));
}

async function appendStudentSubmissionIndex(
  kv: KVNamespace,
  username: string,
  submissionId: string
): Promise<void> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  const id = String(submissionId || "").trim();
  if (!user || !id) return;
  const existing = await readStudentSubmissionsIndex(kv, user);
  const index = existing ? [...existing] : [];
  if (!index.includes(id)) {
    index.unshift(id);
    await writeStudentSubmissionsIndex(kv, user, index);
  } else if (existing === null) {
    await writeStudentSubmissionsIndex(kv, user, index);
  }
}

async function loadSubmissionsByIds(
  kv: KVNamespace,
  ids: string[]
): Promise<HomeworkSubmission[]> {
  if (!ids.length) return [];
  const CHUNK = 25;
  const submissions: HomeworkSubmission[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const raws = await Promise.all(slice.map((id) => kv.get(submissionKey(id))));
    for (const raw of raws) {
      if (!raw) continue;
      try {
        submissions.push(JSON.parse(raw) as HomeworkSubmission);
      } catch {
        /* skip corrupt */
      }
    }
  }
  return submissions;
}

async function writeSubmission(kv: KVNamespace, submission: HomeworkSubmission): Promise<void> {
  await kv.put(submissionKey(submission.id), JSON.stringify(submission));
  const index = await readSubmissionsIndex(kv);
  if (!index.includes(submission.id)) {
    index.unshift(submission.id);
    await writeSubmissionsIndex(kv, index);
  }
  await appendStudentSubmissionIndex(kv, submission.username, submission.id);
}

async function storeSubmissionPhoto(
  kv: KVNamespace,
  file: File
): Promise<HomeworkSubmissionPhoto> {
  const mimeType = String(file.type || "").trim().toLowerCase();
  if (!SUBMISSION_PHOTO_TYPES.has(mimeType)) throw new Error("IMAGE_TYPE");
  if (file.size > SUBMISSION_PHOTO_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const id = makeSubmissionPhotoId();
  const buffer = await file.arrayBuffer();
  await kv.put(submissionPhotoKey(id), buffer);
  await kv.put(
    submissionPhotoMetaKey(id),
    JSON.stringify({
      mimeType,
      name: String(file.name || "").trim() || undefined,
      size: buffer.byteLength,
      createdAt: new Date().toISOString(),
    })
  );

  return { id, mimeType, name: String(file.name || "").trim() || undefined };
}

function normalizeSubmissionMediaMime(mimeType: string): string {
  return String(mimeType || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
}

function inferSubmissionMediaMime(name: string, fallback: string): string {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".ogg")) return "video/ogg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return fallback;
}

function isAllowedSubmissionMedia(mimeType: string): boolean {
  const base = normalizeSubmissionMediaMime(mimeType);
  if (!base) return false;
  return SUBMISSION_VIDEO_TYPES.has(base);
}

async function storeSubmissionVideo(
  kv: KVNamespace,
  file: File
): Promise<HomeworkSubmissionVideo> {
  const mimeType =
    normalizeSubmissionMediaMime(file.type) ||
    inferSubmissionMediaMime(String(file.name || ""), "video/webm");
  if (!isAllowedSubmissionMedia(mimeType)) throw new Error("VIDEO_TYPE");
  if (file.size > SUBMISSION_VIDEO_MAX_BYTES) throw new Error("VIDEO_TOO_LARGE");

  const id = makeSubmissionVideoId();
  const buffer = await file.arrayBuffer();
  await kv.put(submissionVideoKey(id), buffer);
  await kv.put(
    submissionVideoMetaKey(id),
    JSON.stringify({
      mimeType,
      name: String(file.name || "").trim() || undefined,
      size: buffer.byteLength,
      createdAt: new Date().toISOString(),
    })
  );

  return { id, mimeType, name: String(file.name || "").trim() || undefined };
}

export async function saveHomeworkReviewMedia(
  teacherUsername: string | undefined,
  file: File,
  env: KvEnv
): Promise<HomeworkReviewMedia> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const stored = await storeSubmissionVideo(kv, file);
  const kind = stored.mimeType.startsWith("audio/") ? "audio" : "video";
  return { id: stored.id, kind, mimeType: stored.mimeType };
}

export async function saveHomeworkOnlineSubmission(
  data: HomeworkOnlineSubmitInput,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const assignmentId = String(data.assignmentId || "").trim();
  if (!assignmentId) throw new Error("ASSIGNMENT_REQUIRED");
  await assertCurriculumTrialHomeworkAccess(kv, username, assignmentId);

  const section1 = Array.isArray(data.section1) ? data.section1 : [];
  const section2 = Array.isArray(data.section2) ? data.section2 : [];
  const listening = Array.isArray(data.listening) ? data.listening : [];
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const comments = Array.isArray(data.comments) ? data.comments : [];
  if (!section1.length && !section2.length && !listening.length && !answers.length) {
    throw new Error("ANSWERS_REQUIRED");
  }

  const submission: HomeworkSubmission = {
    id: makeSubmissionId(),
    type: "online",
    username,
    displayName: String(data.displayName || username).trim() || username,
    assignmentId,
    lessonName: String(data.lessonName || "").trim() || undefined,
    title: String(data.title || "").trim() || undefined,
    register: String(data.register || "").trim() || undefined,
    scoreCorrect: data.scoreCorrect,
    scoreTotal: data.scoreTotal,
    section1,
    section2,
    listening,
    answers: answers.length ? answers : undefined,
    comments: comments.length ? comments : undefined,
    submittedAt: new Date().toISOString(),
    reviewStatus: "submitted",
  };

  await writeSubmission(kv, submission);
  return { id: submission.id };
}

function normalizeStoredComment(raw: HomeworkComment | Record<string, unknown>): HomeworkComment | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String((raw as HomeworkComment).id || "").trim();
  const text = String((raw as HomeworkComment).text || "");
  const teacherRemark = String((raw as HomeworkComment).teacherRemark || "").trim();
  const remarkMediaRaw = (raw as HomeworkComment).teacherRemarkMedia;
  let teacherRemarkMedia: HomeworkReviewMedia | undefined;
  if (remarkMediaRaw && typeof remarkMediaRaw === "object") {
    const mediaId = String((remarkMediaRaw as HomeworkReviewMedia).id || "").trim();
    const kindRaw = String((remarkMediaRaw as HomeworkReviewMedia).kind || "").trim().toLowerCase();
    const kind: "audio" | "video" = kindRaw === "audio" ? "audio" : "video";
    if (mediaId) {
      teacherRemarkMedia = {
        id: mediaId,
        kind,
        mimeType: String((remarkMediaRaw as HomeworkReviewMedia).mimeType || "").trim() || undefined,
      };
    }
  }
  const authorRaw = String((raw as HomeworkComment).author || "").trim().toLowerCase();
  const author: "student" | "teacher" =
    authorRaw === "teacher" ? "teacher" : "student";
  const anchor = (raw as HomeworkComment).anchor
    ? String((raw as HomeworkComment).anchor)
    : undefined;
  if (!id) return null;
  if (!text.trim() && !anchor && !teacherRemark && !teacherRemarkMedia && author !== "teacher") return null;

  const rect = (raw as HomeworkComment).anchorRect;
  return {
    id,
    text,
    author,
    teacherRemark: teacherRemark || undefined,
    teacherRemarkMedia,
    anchor,
    anchorRect:
      rect && typeof rect === "object"
        ? {
            left: Number(rect.left),
            top: Number(rect.top),
            right: Number(rect.right),
            bottom: Number(rect.bottom),
            width: Number(rect.width),
            height: Number(rect.height),
          }
        : undefined,
    slideIndex:
      typeof (raw as HomeworkComment).slideIndex === "number"
        ? (raw as HomeworkComment).slideIndex
        : 0,
    x: typeof (raw as HomeworkComment).x === "number" ? (raw as HomeworkComment).x : undefined,
    y: typeof (raw as HomeworkComment).y === "number" ? (raw as HomeworkComment).y : undefined,
    createdAt: String((raw as HomeworkComment).createdAt || new Date().toISOString()),
    updatedAt: (raw as HomeworkComment).updatedAt
      ? String((raw as HomeworkComment).updatedAt)
      : undefined,
  };
}

/** Audio/video already saved on a question note, reused by id (no second upload). */
export interface AnswerBankMedia {
  id: string;
  kind: "audio" | "video";
  mimeType?: string;
}

/** Replies JD has already written for a given question, newest first. */
export interface AnswerBankReply {
  text: string;
  usedAt: string;
  count: number;
  /** Recording that went with this wording, when he saved one. */
  media?: AnswerBankMedia;
}

export interface AnswerBank {
  assignmentId: string;
  /** Keyed by question slide index, as a string. */
  slides: Record<string, AnswerBankReply[]>;
  updatedAt: string;
  /**
   * Set after past submissions were scanned once so older clips
   * (saved before recordings lived in this bank) show up as suggestions.
   */
  recordingsBackfillAt?: string;
}

const answerBankKey = (assignmentId: string) => `answer-bank:${assignmentId}`;
const ANSWER_BANK_MAX_PER_SLIDE = 6;

export async function readAnswerBank(
  kv: KVNamespace | undefined,
  assignmentId: string
): Promise<AnswerBank | null> {
  const id = String(assignmentId || "").trim();
  if (!kv || !id) return null;
  try {
    const raw = await kv.get(answerBankKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnswerBank;
    if (!parsed || typeof parsed !== "object" || !parsed.slides) return null;
    return parsed;
  } catch (err) {
    console.error("readAnswerBank failed:", err);
    return null;
  }
}

function normalizeAnswerBankMedia(raw: unknown): AnswerBankMedia | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const id = String((raw as AnswerBankMedia).id || "").trim();
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) return undefined;
  const kindRaw = String((raw as AnswerBankMedia).kind || "")
    .trim()
    .toLowerCase();
  if (kindRaw !== "audio" && kindRaw !== "video") return undefined;
  const mime = String((raw as AnswerBankMedia).mimeType || "").trim();
  return {
    id,
    kind: kindRaw,
    mimeType: mime ? mime.slice(0, 100) : undefined,
  };
}

function packAnswerBankReply(raw: AnswerBankReply | undefined | null): AnswerBankReply | null {
  if (!raw) return null;
  const text = String(raw.text || "").trim();
  const media = normalizeAnswerBankMedia(raw.media);
  if (!text && !media) return null;
  const count = Number(raw.count);
  return {
    text,
    usedAt: String(raw.usedAt || ""),
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
    ...(media ? { media } : {}),
  };
}

function slidesFromAnswerBank(bank: AnswerBank | null): Record<string, AnswerBankReply[]> {
  const slides: Record<string, AnswerBankReply[]> = {};
  if (!bank?.slides) return slides;
  for (const [slot, list] of Object.entries(bank.slides)) {
    if (!/^\d+$/.test(slot)) continue;
    const clean = (Array.isArray(list) ? list : [])
      .map((row) => packAnswerBankReply(row))
      .filter((row): row is AnswerBankReply => Boolean(row))
      .slice(0, ANSWER_BANK_MAX_PER_SLIDE);
    if (clean.length) slides[slot] = clean;
  }
  return slides;
}

/**
 * Pull recordings off question notes already saved for this worksheet so the
 * next review can offer the same clip (same media id, no re-upload).
 * One scan per assignment; later submits store the clip directly.
 */
async function backfillAnswerBankRecordings(
  kv: KVNamespace,
  assignmentId: string,
  bank: AnswerBank | null
): Promise<AnswerBank> {
  const now = new Date().toISOString();
  const next: AnswerBank = bank || {
    assignmentId,
    slides: {},
    updatedAt: now,
  };
  next.slides = slidesFromAnswerBank(next);

  let submissions: HomeworkSubmission[] = [];
  try {
    const ids = await readSubmissionsIndex(kv);
    submissions = await loadSubmissionsByIds(kv, ids);
  } catch (err) {
    console.error("answer bank recording backfill scan failed:", err);
    return next;
  }

  /* Index is newest first. First media we see for a wording wins. */
  const newestMedia = new Map<string, AnswerBankMedia>();
  for (const sub of submissions) {
    if (String(sub.assignmentId || "").trim() !== assignmentId) continue;
    for (const note of sub.comments || []) {
      if (note.author !== "teacher") continue;
      const media = normalizeAnswerBankMedia(note.teacherRemarkMedia);
      if (!media) continue;
      const slot = String(typeof note.slideIndex === "number" ? note.slideIndex : 0);
      const text = String(note.text || "").trim();
      const key = slot + "\n" + text;
      if (!newestMedia.has(key)) newestMedia.set(key, media);
    }
  }

  const inserts = new Map<string, AnswerBankReply[]>();
  for (const [key, media] of newestMedia) {
    const splitAt = key.indexOf("\n");
    const slot = key.slice(0, splitAt);
    const text = key.slice(splitAt + 1);
    const list = Array.isArray(next.slides[slot]) ? next.slides[slot] : [];
    const match = list.find((row) => row.text === text);
    if (match) {
      if (!match.media) match.media = media;
      continue;
    }
    const extra = inserts.get(slot) || [];
    extra.push({ text, usedAt: now, count: 1, media });
    inserts.set(slot, extra);
  }
  for (const [slot, extra] of inserts) {
    const list = Array.isArray(next.slides[slot]) ? next.slides[slot] : [];
    /* Keep the newest wording first so text suggestions do not move. */
    next.slides[slot] = [...list, ...extra].slice(0, ANSWER_BANK_MAX_PER_SLIDE);
  }

  next.recordingsBackfillAt = now;
  next.updatedAt = now;
  next.assignmentId = assignmentId;
  try {
    await kv.put(answerBankKey(assignmentId), JSON.stringify(next));
  } catch (err) {
    console.error("answer bank recording backfill save failed:", err);
  }
  return next;
}

/**
 * Saved replies for review. Includes recordings from past question notes once,
 * then the copy written on each submit.
 */
export async function readAnswerBankForReview(
  kv: KVNamespace | undefined,
  assignmentId: string
): Promise<Record<string, AnswerBankReply[]>> {
  const id = String(assignmentId || "").trim();
  if (!kv || !id) return {};
  let bank = await readAnswerBank(kv, id);
  if (!bank?.recordingsBackfillAt) {
    bank = await backfillAnswerBankRecordings(kv, id, bank);
  }
  return slidesFromAnswerBank(bank);
}

/**
 * Remember the question notes JD just wrote so the next student's review can
 * start from them. Same wording on the same question bumps its count instead of
 * piling up duplicates. A recording saved with that note is kept with it
 * (same asset id). Deleting the clip on one student does not drop it from the
 * bank; a newly saved clip replaces the suggestion for next time.
 */
async function recordAnswerBank(
  kv: KVNamespace,
  assignmentId: string,
  comments: HomeworkComment[],
  now: string
): Promise<void> {
  const id = String(assignmentId || "").trim();
  if (!id) return;
  const notes = comments.filter(
    (c) => c.author === "teacher" && (c.text.trim() || c.teacherRemarkMedia?.id)
  );
  if (!notes.length) return;

  const bank: AnswerBank = (await readAnswerBank(kv, id)) || {
    assignmentId: id,
    slides: {},
    updatedAt: now,
  };
  bank.slides = slidesFromAnswerBank(bank);

  for (const note of notes) {
    const slot = String(typeof note.slideIndex === "number" ? note.slideIndex : 0);
    const text = note.text.trim();
    const incoming = normalizeAnswerBankMedia(note.teacherRemarkMedia);
    const list = Array.isArray(bank.slides[slot]) ? bank.slides[slot] : [];
    const match = list.find((r) => r.text === text);
    const rest = list.filter((r) => r.text !== text);
    const media = incoming || match?.media;
    bank.slides[slot] = [
      {
        text,
        usedAt: now,
        count: (match?.count || 0) + 1,
        ...(media ? { media } : {}),
      },
      ...rest,
    ].slice(0, ANSWER_BANK_MAX_PER_SLIDE);
  }

  bank.updatedAt = now;
  try {
    await kv.put(answerBankKey(id), JSON.stringify(bank));
  } catch (err) {
    console.error("recordAnswerBank failed:", err);
  }
}

/**
 * Teacher submits review notes for an existing submission.
 * Merges teacher remarks onto student memos and appends teacher-authored question notes.
 */
export async function saveHomeworkReview(
  data: HomeworkReviewSaveInput,
  env: KvEnv
): Promise<HomeworkSubmission> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const submissionId = String(data.submissionId || "").trim();
  if (!submissionId) throw new Error("SUBMISSION_REQUIRED");

  const existing = await getHomeworkSubmission(env, submissionId);
  if (!existing) throw new Error("NOT_FOUND");

  const incoming = Array.isArray(data.comments) ? data.comments : [];
  const byId = new Map<string, HomeworkComment>();
  for (const raw of existing.comments || []) {
    const c = normalizeStoredComment(raw);
    if (c) byId.set(c.id, c);
  }

  const now = new Date().toISOString();
  for (const raw of incoming) {
    const next = normalizeStoredComment(raw);
    if (!next) continue;
    const prev = byId.get(next.id);
    if (prev) {
      const author =
        prev.author === "teacher" || next.author === "teacher"
          ? next.author === "teacher"
            ? "teacher"
            : prev.author || "student"
          : prev.author || "student";
      if (author === "teacher" || prev.author === "teacher") {
        byId.set(next.id, {
          ...prev,
          ...next,
          author: "teacher",
          text: next.text.trim() ? next.text : prev.text,
          teacherRemark: undefined,
          updatedAt: now,
        });
      } else {
        const rawIncoming = raw as HomeworkComment & { teacherRemarkMedia?: HomeworkReviewMedia | null };
        const clearRemarkMedia =
          Object.prototype.hasOwnProperty.call(rawIncoming, "teacherRemarkMedia") &&
          rawIncoming.teacherRemarkMedia === null;
        byId.set(next.id, {
          ...prev,
          author: "student",
          teacherRemark: next.teacherRemark || prev.teacherRemark || undefined,
          teacherRemarkMedia: clearRemarkMedia
            ? undefined
            : next.teacherRemarkMedia || prev.teacherRemarkMedia,
          anchor: next.anchor || prev.anchor,
          anchorRect: next.anchorRect || prev.anchorRect,
          slideIndex:
            typeof next.slideIndex === "number" ? next.slideIndex : prev.slideIndex,
          x: typeof next.x === "number" ? next.x : prev.x,
          y: typeof next.y === "number" ? next.y : prev.y,
          /* Never let a review wipe the student memo body. */
          text: prev.text,
          updatedAt: now,
        });
      }
    } else if (next.author === "teacher") {
      byId.set(next.id, { ...next, author: "teacher", updatedAt: now });
    }
  }

  const comments = [...byId.values()].filter((c) => {
    if (c.author === "teacher") return Boolean(c.text.trim() || c.teacherRemarkMedia);
    return Boolean(c.anchor || c.text.trim() || c.teacherRemark || c.teacherRemarkMedia);
  });

  const markReviewed = data.markReviewed !== false;
  const updated: HomeworkSubmission = {
    ...existing,
    comments: comments.length ? comments : undefined,
    reviewStatus: markReviewed ? "reviewed" : existing.reviewStatus || "submitted",
    reviewedAt: markReviewed ? now : existing.reviewedAt,
    teacherNotesSubmittedAt: now,
  };
  if (Object.prototype.hasOwnProperty.call(data, "questionMarks")) {
    updated.questionMarks = normalizeQuestionMarks(data.questionMarks);
  }

  if (markReviewed) {
    updated.notebook = buildNotebookPack(updated, now);
    await recordAnswerBank(kv, updated.assignmentId, comments, now);
  }

  await writeSubmission(kv, updated);
  return updated;
}

function notebookMediaRef(
  media: HomeworkReviewMedia | undefined | null
): HomeworkReviewMedia | undefined {
  const id = String(media?.id || "").trim();
  if (!id) return undefined;
  return {
    id,
    kind: media?.kind === "video" ? "video" : "audio",
    mimeType: String(media?.mimeType || "").trim() || undefined,
  };
}

/** Build Notebook rows from reviewed comments (note pairs + standalone JD notes). */
export function buildNotebookRows(comments: HomeworkComment[] | undefined): HomeworkNotebookRow[] {
  const list = Array.isArray(comments) ? comments : [];
  const rows: HomeworkNotebookRow[] = [];

  for (const c of list) {
    const author = c.author === "teacher" ? "teacher" : "student";
    const slideIndex = typeof c.slideIndex === "number" ? c.slideIndex : undefined;
    const jdMedia = notebookMediaRef(c.teacherRemarkMedia);
    const hasJdMedia = Boolean(jdMedia);
    const jdText = String(c.teacherRemark || "").trim();
    const studentText = String(c.text || "").trim();
    const studentAnchor = String(c.anchor || "").trim() || undefined;

    if (author === "teacher") {
      const noteText = studentText;
      if (!noteText && !hasJdMedia) continue;
      rows.push({
        id: c.id,
        kind: "jd",
        jdText: noteText || undefined,
        hasJdMedia,
        jdMedia,
        studentAnchor,
        slideIndex,
        commentId: c.id,
      });
      continue;
    }

    /* Student memo: only include once JD has replied (text and/or media). */
    if (!jdText && !hasJdMedia) continue;
    rows.push({
      id: c.id,
      kind: "pair",
      studentText: studentText || undefined,
      studentAnchor,
      jdText: jdText || undefined,
      hasJdMedia,
      jdMedia,
      slideIndex,
      commentId: c.id,
    });
  }

  return rows;
}

/** Fill missing jdMedia on older packs from live submission comments. */
function enrichNotebookRowsMedia(
  rows: HomeworkNotebookRow[],
  comments: HomeworkComment[] | undefined
): HomeworkNotebookRow[] {
  if (!rows.length) return rows;
  if (!rows.some((row) => row.hasJdMedia && !row.jdMedia?.id)) return rows;
  const list = Array.isArray(comments) ? comments : [];
  if (!list.length) return rows;
  const byId = new Map(list.map((c) => [c.id, c]));
  return rows.map((row) => {
    if (row.jdMedia?.id) return row;
    const media = notebookMediaRef(byId.get(row.commentId)?.teacherRemarkMedia);
    if (!media) return row;
    return { ...row, hasJdMedia: true, jdMedia: media };
  });
}

function answerTextForSlide(
  submission: HomeworkSubmission,
  slideIndex: number | undefined
): string {
  if (typeof slideIndex !== "number" || slideIndex < 0) return "";
  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  const row = answers[slideIndex];
  if (!row || typeof row !== "object") return "";
  return String(
    row.student || row.piecesDisplay || row.completed || row.question || ""
  ).trim();
}

function enrichNotebookRowsFromSubmission(
  rows: HomeworkNotebookRow[],
  submission: HomeworkSubmission
): HomeworkNotebookRow[] {
  const marks = normalizeQuestionMarks(submission.questionMarks) || {};
  /* Marked questions with no written note still get a 問 button (✓ / ✗ + answer). */
  const withNote = new Set(
    rows
      .filter((r) => r.kind !== "mark")
      .map((r) => r.slideIndex)
      .filter((n): n is number => typeof n === "number" && n >= 0)
  );
  const markOnly: HomeworkNotebookRow[] = [];
  for (const [key, value] of Object.entries(marks)) {
    const slide = Number(key);
    if (!Number.isInteger(slide) || slide < 0) continue;
    if (value !== "correct" && value !== "wrong") continue;
    if (withNote.has(slide)) continue;
    if (rows.some((r) => r.kind === "mark" && r.slideIndex === slide)) continue;
    markOnly.push({
      id: "mark-" + slide,
      kind: "mark",
      slideIndex: slide,
      commentId: "",
      questionMark: value,
    });
  }
  rows = [...rows, ...markOnly];
  return rows.map((row) => {
    const slide =
      typeof row.slideIndex === "number" && row.slideIndex >= 0
        ? row.slideIndex
        : undefined;
    const mark =
      slide != null && (marks[String(slide)] === "correct" || marks[String(slide)] === "wrong")
        ? marks[String(slide)]
        : undefined;
    const answer = answerTextForSlide(submission, slide);
    return {
      ...row,
      studentAnswer: answer || row.studentAnswer || undefined,
      questionMark: mark || row.questionMark,
    };
  });
}

function buildNotebookPack(
  submission: HomeworkSubmission,
  savedAt: string
): HomeworkNotebookPack {
  const marks = normalizeQuestionMarks(submission.questionMarks);
  return {
    savedAt,
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    title: submission.title,
    lessonName: submission.lessonName,
    displayName: submission.displayName,
    reviewedAt: submission.reviewedAt || savedAt,
    rows: enrichNotebookRowsFromSubmission(
      buildNotebookRows(submission.comments),
      submission
    ),
    questionMarks: marks,
  };
}

/**
 * Student Notebook list: reviewed/acknowledged online submissions with a pack
 * (or rebuild from comments for older submissions that predate packs).
 */
export async function listHomeworkNotebook(
  env: KvEnv,
  opts: { username?: string }
): Promise<HomeworkNotebookPack[]> {
  const username = String(opts.username || "")
    .trim()
    .toLowerCase();
  if (!username) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudent(username, env))) throw new Error("UNKNOWN_STUDENT");

  const submissions = await listHomeworkSubmissions(env, { student: username });
  const packs: HomeworkNotebookPack[] = [];

  for (const sub of submissions) {
    if (sub.type !== "online") continue;
    const status = sub.reviewStatus || "submitted";
    if (status !== "reviewed" && status !== "acknowledged") continue;

    if (sub.notebook?.rows) {
      const marks = normalizeQuestionMarks(
        sub.questionMarks || sub.notebook.questionMarks
      );
      packs.push({
        ...sub.notebook,
        submissionId: sub.id,
        assignmentId: sub.assignmentId,
        title: sub.notebook.title || sub.title,
        lessonName: sub.notebook.lessonName || sub.lessonName,
        displayName: sub.notebook.displayName || sub.displayName,
        reviewedAt: sub.notebook.reviewedAt || sub.reviewedAt || sub.submittedAt,
        rows: enrichNotebookRowsFromSubmission(
          enrichNotebookRowsMedia(sub.notebook.rows, sub.comments),
          sub
        ),
        questionMarks: marks,
      });
      continue;
    }

    /* Backfill for reviews saved before Phase 2 notebook packs existed. */
    const rows = enrichNotebookRowsFromSubmission(
      buildNotebookRows(sub.comments),
      sub
    );
    if (!rows.length) continue;
    const marks = normalizeQuestionMarks(sub.questionMarks);
    packs.push({
      savedAt: sub.reviewedAt || sub.teacherNotesSubmittedAt || sub.submittedAt,
      submissionId: sub.id,
      assignmentId: sub.assignmentId,
      title: sub.title,
      lessonName: sub.lessonName,
      displayName: sub.displayName,
      reviewedAt: sub.reviewedAt || sub.submittedAt,
      rows,
      questionMarks: marks,
    });
  }

  packs.sort(
    (a, b) =>
      new Date(b.reviewedAt || b.savedAt || 0).getTime() -
      new Date(a.reviewedAt || a.savedAt || 0).getTime()
  );
  return packs;
}

/** Student finished reading JD’s notes and is ready for new homework. */
export async function saveHomeworkReviewAck(
  data: HomeworkReviewAckInput,
  env: KvEnv
): Promise<{ submission: HomeworkSubmission; nextHomeworkId: string | null }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const submissionId = String(data.submissionId || "").trim();
  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!submissionId) throw new Error("SUBMISSION_REQUIRED");
  if (!username) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const existing = await getHomeworkSubmission(env, submissionId);
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.username !== username) throw new Error("FORBIDDEN");
  if (existing.type !== "online") throw new Error("NOT_ONLINE");

  const status = existing.reviewStatus || "submitted";
  if (status !== "reviewed" && status !== "acknowledged") {
    throw new Error("NOT_REVIEWED");
  }

  const now = new Date().toISOString();
  const updated: HomeworkSubmission = {
    ...existing,
    reviewStatus: "acknowledged",
    studentNotesAckedAt: existing.studentNotesAckedAt || now,
  };
  await writeSubmission(kv, updated);

  let nextHomeworkId: string | null = null;
  const assignmentId = String(updated.assignmentId || "").trim();
  const currentHomeworkId = String(
    (await kv.get(studentCurrentHomeworkKey(username))) || ""
  ).trim();

  if (!currentHomeworkId || currentHomeworkId === assignmentId) {
    const waiting = await readHomeworkWaitingQueue(kv, username);
    if (waiting.length) {
      const [next, ...rest] = waiting;
      nextHomeworkId = next || null;
      if (nextHomeworkId) {
        await kv.put(studentCurrentHomeworkKey(username), nextHomeworkId);
      } else {
        await kv.delete(studentCurrentHomeworkKey(username));
      }
      await writeHomeworkWaitingQueue(kv, username, rest);
    }
  }

  return { submission: updated, nextHomeworkId };
}

export async function saveHomeworkPhotoSubmission(
  data: HomeworkPhotoSubmitInput,
  file: File,
  env: KvEnv
): Promise<{ id: string; photoId: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const photo = await storeSubmissionPhoto(kv, file);
  const submission: HomeworkSubmission = {
    id: makeSubmissionId(),
    type: "photo",
    username,
    displayName: String(data.displayName || username).trim() || username,
    assignmentId: String(data.assignmentId || "printed-homework").trim() || "printed-homework",
    lessonName: String(data.lessonName || "").trim() || undefined,
    photo,
    submittedAt: new Date().toISOString(),
    reviewStatus: "submitted",
  };

  await writeSubmission(kv, submission);
  return { id: submission.id, photoId: photo.id };
}

/**
 * Store a per-question audio/video answer clip without creating a teacher
 * "waiting on notes" submission. Final hand-in still goes through online submit.
 */
export async function saveHomeworkInlineMedia(
  data: HomeworkVideoSubmitInput,
  file: File,
  env: KvEnv
): Promise<{ videoId: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const video = await storeSubmissionVideo(kv, file);
  return { videoId: video.id };
}

export async function saveHomeworkVideoSubmission(
  data: HomeworkVideoSubmitInput,
  file: File,
  env: KvEnv
): Promise<{ id: string; videoId: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const video = await storeSubmissionVideo(kv, file);
  const submission: HomeworkSubmission = {
    id: makeSubmissionId(),
    type: "video",
    username,
    displayName: String(data.displayName || username).trim() || username,
    assignmentId: String(data.assignmentId || "video-homework").trim() || "video-homework",
    lessonName: String(data.lessonName || "").trim() || undefined,
    video,
    submittedAt: new Date().toISOString(),
    reviewStatus: "submitted",
  };

  await writeSubmission(kv, submission);
  return { id: submission.id, videoId: video.id };
}

export async function listHomeworkSubmissions(
  env: KvEnv,
  opts?: { student?: string; limit?: number }
): Promise<HomeworkSubmission[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const filterStudent = String(opts?.student || "")
    .trim()
    .toLowerCase();
  const limit =
    typeof opts?.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.floor(opts.limit)
      : 0;

  function takeIds(ids: string[]): string[] {
    if (!limit) return ids;
    return ids.slice(0, limit);
  }

  if (filterStudent) {
    const studentIds = await readStudentSubmissionsIndex(kv, filterStudent);
    if (studentIds !== null) {
      const submissions = await loadSubmissionsByIds(kv, takeIds(studentIds));
      return submissions.filter(
        (entry) => String(entry.username || "").toLowerCase() === filterStudent
      );
    }

    /* Cold path: one parallel scan, then backfill per-student index. */
    const allIds = await readSubmissionsIndex(kv);
    const all = await loadSubmissionsByIds(kv, allIds);
    const mine = all.filter(
      (entry) => String(entry.username || "").toLowerCase() === filterStudent
    );
    await writeStudentSubmissionsIndex(
      kv,
      filterStudent,
      mine.map((entry) => entry.id)
    );
    return limit ? mine.slice(0, limit) : mine;
  }

  const ids = await readSubmissionsIndex(kv);
  return loadSubmissionsByIds(kv, takeIds(ids));
}

export async function getHomeworkSubmission(
  env: KvEnv,
  id: string
): Promise<HomeworkSubmission | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const submissionId = String(id || "").trim();
  if (!submissionId) return null;

  const raw = await kv.get(submissionKey(submissionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HomeworkSubmission;
  } catch {
    return null;
  }
}

export async function loadHomeworkSubmissionPhoto(
  teacherUsername: string | undefined,
  photoId: string,
  env: KvEnv
): Promise<{ body: ArrayBuffer; mimeType: string } | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(photoId || "").trim();
  if (!id) return null;

  const metaRaw = await kv.get(submissionPhotoMetaKey(id));
  const body = await kv.get(submissionPhotoKey(id), "arrayBuffer");
  if (!metaRaw || !body) return null;

  try {
    const meta = JSON.parse(metaRaw) as { mimeType?: string };
    return { body, mimeType: meta.mimeType || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** In-progress worksheet answers (synced per student account). */

export interface HomeworkDraft {
  username: string;
  assignmentId: string;
  answers: Record<string, string>;
  updatedAt: string;
}

export interface HomeworkDraftSaveInput {
  username?: string;
  assignmentId?: string;
  answers?: Record<string, string>;
}

export async function loadHomeworkDraft(
  env: KvEnv,
  username: string,
  assignmentId: string
): Promise<HomeworkDraft | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(username || "")
    .trim()
    .toLowerCase();
  const id = String(assignmentId || "").trim();
  if (!user || !id) return null;

  const raw = await kv.get(homeworkDraftKey(user, id));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as HomeworkDraft;
    if (draft.username !== user || draft.assignmentId !== id) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function saveHomeworkDraft(
  data: HomeworkDraftSaveInput,
  env: KvEnv
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const assignmentId = String(data.assignmentId || "").trim();
  if (!assignmentId) throw new Error("ASSIGNMENT_REQUIRED");
  await assertCurriculumTrialHomeworkAccess(kv, username, assignmentId);

  const answers =
    data.answers && typeof data.answers === "object" && !Array.isArray(data.answers)
      ? data.answers
      : {};

  const draft: HomeworkDraft = {
    username,
    assignmentId,
    answers,
    updatedAt: new Date().toISOString(),
  };

  await kv.put(homeworkDraftKey(username, assignmentId), JSON.stringify(draft));
}

export async function deleteHomeworkDraft(
  env: KvEnv,
  username: string,
  assignmentId: string
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(username || "")
    .trim()
    .toLowerCase();
  const id = String(assignmentId || "").trim();
  if (!user || !id) return;

  await kv.delete(homeworkDraftKey(user, id));
}

/** Student Daily Notebook — free notes keyed by Japan calendar day. */

const dailyNotebookKey = (username: string) => `hw-daily-notebook:${username}`;

const DAILY_NOTEBOOK_MAX_CHARS = 20000;

export interface DailyNotebookEntry {
  text: string;
  updatedAt: string;
}

export interface DailyNotebookStore {
  username: string;
  entries: Record<string, DailyNotebookEntry>;
  updatedAt: string;
}

export interface DailyNotebookSaveInput {
  username?: string;
  date?: string;
  text?: string;
}

/** YYYY-MM-DD in Asia/Tokyo. */
export function tokyoDateKey(from: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
}

export function isValidDailyNotebookDateKey(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return false;
  const probe = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  return tokyoDateKey(probe) === raw;
}

export function shiftTokyoDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d + deltaDays, 3, 0, 0));
  return tokyoDateKey(probe);
}

async function loadDailyNotebookStore(
  env: KvEnv,
  username: string
): Promise<DailyNotebookStore> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");

  const raw = await kv.get(dailyNotebookKey(user));
  if (!raw) {
    return { username: user, entries: {}, updatedAt: "" };
  }
  try {
    const parsed = JSON.parse(raw) as DailyNotebookStore;
    const entries =
      parsed?.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
        ? parsed.entries
        : {};
    return {
      username: user,
      entries,
      updatedAt: String(parsed?.updatedAt || ""),
    };
  } catch {
    return { username: user, entries: {}, updatedAt: "" };
  }
}

export async function getDailyNotebook(
  env: KvEnv,
  opts: { username: string; date?: string }
): Promise<{
  username: string;
  today: string;
  date: string;
  text: string;
  updatedAt: string;
  dates: string[];
  /** Saved day texts for client-side notebook search (date → text). */
  texts: Record<string, string>;
}> {
  const store = await loadDailyNotebookStore(env, opts.username);
  const today = tokyoDateKey();
  const want = String(opts.date || "").trim() || today;
  if (!isValidDailyNotebookDateKey(want)) throw new Error("DATE_INVALID");
  if (want > today) throw new Error("DATE_FUTURE");

  const entry = store.entries[want];
  const dates = Object.keys(store.entries)
    .filter((k) => isValidDailyNotebookDateKey(k) && k <= today)
    .sort();
  const texts: Record<string, string> = {};
  for (const k of dates) {
    texts[k] = String(store.entries[k]?.text || "");
  }

  return {
    username: store.username,
    today,
    date: want,
    text: String(entry?.text || ""),
    updatedAt: String(entry?.updatedAt || ""),
    dates,
    texts,
  };
}

export async function saveDailyNotebook(
  data: DailyNotebookSaveInput,
  env: KvEnv
): Promise<{
  username: string;
  today: string;
  date: string;
  text: string;
  updatedAt: string;
  dates: string[];
  texts: Record<string, string>;
}> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!username) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const today = tokyoDateKey();
  const date = String(data.date || "").trim();
  if (!isValidDailyNotebookDateKey(date)) throw new Error("DATE_INVALID");
  if (date > today) throw new Error("DATE_FUTURE");

  const text = String(data.text ?? "");
  if (text.length > DAILY_NOTEBOOK_MAX_CHARS) throw new Error("TEXT_TOO_LONG");

  const store = await loadDailyNotebookStore(env, username);
  const now = new Date().toISOString();
  if (!text.trim()) {
    delete store.entries[date];
  } else {
    store.entries[date] = { text, updatedAt: now };
  }
  store.updatedAt = now;
  store.username = username;

  await kv.put(dailyNotebookKey(username), JSON.stringify(store));

  return getDailyNotebook(env, { username, date });
}

/** Daily Exercise sentences — one saved set per Japan calendar day. */

const dailyExerciseKey = (username: string) => `hw-daily-exercise:${username}`;

const DAILY_EXERCISE_MAX_LINES = 10;
const DAILY_EXERCISE_LINE_MAX = 200;
const DAILY_EXERCISE_KEEP = 400;

export interface DailyExerciseSubmission {
  id: string;
  date: string;
  submittedAt: string;
  prompt: string;
  lines: string[];
  audioIds?: string[];
}

export interface DailyExerciseStore {
  username: string;
  submissions: DailyExerciseSubmission[];
}

function clampDailyExerciseLines(raw: unknown): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const lines: string[] = [];
  for (const item of src) {
    if (lines.length >= DAILY_EXERCISE_MAX_LINES) break;
    const text = String(item || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > DAILY_EXERCISE_LINE_MAX) throw new Error("LINE_TOO_LONG");
    lines.push(text);
  }
  return lines;
}

function clampDailyExerciseAudio(raw: unknown, count: number): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = String(src[i] || "").trim();
    ids.push(/^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : "");
  }
  return ids;
}

async function loadDailyExerciseStore(
  env: KvEnv,
  username: string
): Promise<DailyExerciseStore> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");
  const raw = await kv.get(dailyExerciseKey(user));
  if (!raw) return { username: user, submissions: [] };
  try {
    const parsed = JSON.parse(raw) as DailyExerciseStore;
    const submissions = Array.isArray(parsed.submissions) ? parsed.submissions : [];
    return {
      username: user,
      submissions: submissions
        .filter((row) => row && typeof row.date === "string" && Array.isArray(row.lines))
        .slice(0, DAILY_EXERCISE_KEEP),
    };
  } catch {
    return { username: user, submissions: [] };
  }
}

export async function listDailyExerciseSubmissions(
  env: KvEnv,
  username: string
): Promise<{ submissions: DailyExerciseSubmission[] }> {
  const store = await loadDailyExerciseStore(env, username);
  const byDate = new Map<string, DailyExerciseSubmission>();
  for (const row of store.submissions) {
    const prev = byDate.get(row.date);
    if (!prev || String(row.submittedAt || row.date).localeCompare(String(prev.submittedAt || prev.date)) > 0) {
      byDate.set(row.date, row);
    }
  }
  const submissions = Array.from(byDate.values()).sort((a, b) =>
    String(b.submittedAt || b.date).localeCompare(String(a.submittedAt || a.date))
  );
  return { submissions };
}

export async function saveDailyExerciseSubmission(
  env: KvEnv,
  input: { username?: string; prompt?: string; lines?: unknown; audioIds?: unknown }
): Promise<{ submission: DailyExerciseSubmission }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const user = String(input.username || "")
    .trim()
    .toLowerCase();
  const store = await loadDailyExerciseStore(env, user);
  const lines = clampDailyExerciseLines(input.lines);
  if (!lines.length) throw new Error("LINES_REQUIRED");
  const audioIds = clampDailyExerciseAudio(input.audioIds, lines.length);
  const date = tokyoDateKey();
  const prompt = String(input.prompt || "今日は何をしましたか").trim().slice(0, 80) || "今日は何をしましたか";
  const submittedAt = new Date().toISOString();
  const submission: DailyExerciseSubmission = {
    id: "dex-" + date,
    date,
    submittedAt,
    prompt,
    lines,
    audioIds,
  };
  const rest = store.submissions.filter((row) => row.date !== date);
  store.submissions = [submission, ...rest].slice(0, DAILY_EXERCISE_KEEP);
  await kv.put(dailyExerciseKey(user), JSON.stringify(store));
  return { submission };
}

/** Situation Card recordings — one saved take per Japan calendar day. */

const sitCardKey = (username: string) => `hw-sit-card:${username}`;

const SIT_CARD_KEEP = 400;

export interface SitCardSubmission {
  id: string;
  date: string;
  submittedAt: string;
  cardTitle: string;
  audioId: string;
}

export interface SitCardStore {
  username: string;
  submissions: SitCardSubmission[];
}

async function loadSitCardStore(env: KvEnv, username: string): Promise<SitCardStore> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");
  const raw = await kv.get(sitCardKey(user));
  if (!raw) return { username: user, submissions: [] };
  try {
    const parsed = JSON.parse(raw) as SitCardStore;
    const submissions = Array.isArray(parsed.submissions) ? parsed.submissions : [];
    return {
      username: user,
      submissions: submissions
        .filter((row) => row && typeof row.date === "string" && String(row.audioId || "").trim())
        .slice(0, SIT_CARD_KEEP),
    };
  } catch {
    return { username: user, submissions: [] };
  }
}

export async function listSitCardSubmissions(
  env: KvEnv,
  username: string
): Promise<{ submissions: SitCardSubmission[] }> {
  const store = await loadSitCardStore(env, username);
  const byDate = new Map<string, SitCardSubmission>();
  for (const row of store.submissions) {
    const prev = byDate.get(row.date);
    if (!prev || String(row.submittedAt || row.date).localeCompare(String(prev.submittedAt || prev.date)) > 0) {
      byDate.set(row.date, row);
    }
  }
  const submissions = Array.from(byDate.values()).sort((a, b) =>
    String(b.submittedAt || b.date).localeCompare(String(a.submittedAt || a.date))
  );
  return { submissions };
}

export async function saveSitCardSubmission(
  env: KvEnv,
  input: { username?: string; cardTitle?: string; audioId?: string }
): Promise<{ submission: SitCardSubmission }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const user = String(input.username || "")
    .trim()
    .toLowerCase();
  const store = await loadSitCardStore(env, user);
  const audioId = String(input.audioId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(audioId)) throw new Error("AUDIO_REQUIRED");
  const date = tokyoDateKey();
  const cardTitle = String(input.cardTitle || "Situation Card").trim().slice(0, 80) || "Situation Card";
  const submittedAt = new Date().toISOString();
  const submission: SitCardSubmission = {
    id: "sit-" + date,
    date,
    submittedAt,
    cardTitle,
    audioId,
  };
  const rest = store.submissions.filter((row) => row.date !== date);
  store.submissions = [submission, ...rest].slice(0, SIT_CARD_KEEP);
  await kv.put(sitCardKey(user), JSON.stringify(store));
  return { submission };
}

/** Immersion Quest — 365 look-fors, one complete per local day (client sends the 5:00 a.m. day key). */

const immersionQuestKey = (username: string) => `hw-immersion-quests:${username}`;

const IMMERSION_QUEST_TOTAL = 365;
const IMMERSION_QUEST_EXAMPLES = 5;
const IMMERSION_QUEST_EX_MAX = 200;

export interface ImmersionQuestCompletion {
  day: number;
  id: string;
  key: string;
  ymd: string;
  examples: string[];
}

export type ImmersionQuestAdvanceMode = "auto" | "manual";

export interface ImmersionQuestProgress {
  username: string;
  currentIndex: number;
  /** Client local day (YYYY-MM-DD, 5:00 a.m. boundary) of the last advance. */
  lastCompletedYmd: string;
  /** Monday date (YYYY-MM-DD) of the working quest instance. A new week starts fresh examples and a clear completion gate. */
  periodKey: string;
  /** How quests move forward: auto advances on Complete; manual waits for Next. */
  advanceMode: ImmersionQuestAdvanceMode;
  seenKey: string;
  examples: string[];
  completed: ImmersionQuestCompletion[];
  puzzlePieces: number[];
  updatedAt: string;
}

/** Accept student PC local YYYY-MM-DD within ±2 days of UTC (timezone skew). */
export function normalizeClientLocalYmd(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const probe = Date.UTC(y, m - 1, d);
  if (Number.isNaN(probe)) return null;
  const utcToday = new Date();
  const utcMid = Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth(), utcToday.getUTCDate());
  const diffDays = Math.abs(probe - utcMid) / 86400000;
  if (diffDays > 2) return null;
  return s;
}

function resolveImmersionTodayYmd(clientYmd?: unknown): string {
  return normalizeClientLocalYmd(clientYmd) || tokyoDateKey();
}

function normalizeAdvanceMode(raw: unknown): ImmersionQuestAdvanceMode {
  return String(raw || "").trim().toLowerCase() === "manual" ? "manual" : "auto";
}

function clampQuestExamples(raw: unknown): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (let i = 0; i < IMMERSION_QUEST_EXAMPLES; i++) {
    out.push(String(src[i] || "").trim().slice(0, IMMERSION_QUEST_EX_MAX));
  }
  return out;
}

function emptyImmersionProgress(username: string): ImmersionQuestProgress {
  return {
    username,
    currentIndex: 0,
    lastCompletedYmd: "",
    periodKey: "",
    advanceMode: "auto",
    seenKey: "",
    examples: ["", "", "", "", ""],
    completed: [],
    puzzlePieces: [],
    updatedAt: "",
  };
}

async function loadImmersionProgress(
  env: KvEnv,
  username: string
): Promise<ImmersionQuestProgress> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const user = String(username || "")
    .trim()
    .toLowerCase();
  const blank = emptyImmersionProgress(user);
  const raw = await kv.get(immersionQuestKey(user));
  if (!raw) return blank;
  try {
    const parsed = JSON.parse(raw) as Partial<ImmersionQuestProgress>;
    const idx = Math.max(0, Math.min(IMMERSION_QUEST_TOTAL, Number(parsed.currentIndex) || 0));
    const pieces = Array.isArray(parsed.puzzlePieces)
      ? parsed.puzzlePieces.map((n) => Number(n)).filter((n) => n >= 1 && n <= IMMERSION_QUEST_TOTAL)
      : [];
    const completed = Array.isArray(parsed.completed) ? parsed.completed : [];
    return {
      username: user,
      currentIndex: idx,
      lastCompletedYmd: String(parsed.lastCompletedYmd || ""),
      periodKey: String(parsed.periodKey || ""),
      advanceMode: normalizeAdvanceMode(parsed.advanceMode),
      seenKey: String(parsed.seenKey || ""),
      examples: clampQuestExamples(parsed.examples),
      completed: completed.slice(0, IMMERSION_QUEST_TOTAL),
      puzzlePieces: pieces,
      updatedAt: String(parsed.updatedAt || ""),
    };
  } catch {
    return blank;
  }
}

async function putImmersionProgress(
  env: KvEnv,
  progress: ImmersionQuestProgress
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  await kv.put(immersionQuestKey(progress.username), JSON.stringify(progress));
}

function normalizeWeekPeriod(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s;
}

/** Whole weeks between two Monday date keys (YYYY-MM-DD). At least 1. */
function weeksBetweenMondays(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / (7 * 86400000)));
}

/** Returns whether to save, and whether this was a week change (not a first stamp). */
function applyImmersionPeriod(
  progress: ImmersionQuestProgress,
  periodRaw: unknown
): { write: boolean; rotated: boolean } {
  const period = normalizeWeekPeriod(periodRaw);
  if (!period) return { write: false, rotated: false };
  if (!progress.periodKey) {
    progress.periodKey = period;
    return { write: true, rotated: false };
  }
  if (progress.periodKey === period) return { write: false, rotated: false };
  /* The quest follows the calendar. A week that was completed already moved on when it was
     completed. Every other week that went by moves the quest one step. */
  const weeks = weeksBetweenMondays(progress.periodKey, period);
  const skipped = Math.max(0, weeks - (progress.lastCompletedYmd ? 1 : 0));
  progress.currentIndex = Math.min(
    IMMERSION_QUEST_TOTAL,
    (Number(progress.currentIndex) || 0) + skipped
  );
  progress.periodKey = period;
  progress.examples = ["", "", "", "", ""];
  progress.lastCompletedYmd = "";
  progress.seenKey = "";
  return { write: true, rotated: true };
}

export async function getImmersionQuests(
  env: KvEnv,
  username: string,
  periodKey?: unknown
): Promise<{ today: string; total: number; progress: ImmersionQuestProgress }> {
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");
  const progress = await loadImmersionProgress(env, user);
  if (applyImmersionPeriod(progress, periodKey).write) {
    progress.updatedAt = new Date().toISOString();
    await putImmersionProgress(env, progress);
  }
  return { today: tokyoDateKey(), total: IMMERSION_QUEST_TOTAL, progress };
}

export async function saveImmersionQuestDraft(
  env: KvEnv,
  data: {
    username?: string;
    examples?: unknown;
    seenKey?: string;
    advanceMode?: unknown;
    ymd?: unknown;
    period?: unknown;
  }
): Promise<{ today: string; total: number; progress: ImmersionQuestProgress }> {
  const user = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");

  const today = resolveImmersionTodayYmd(data.ymd);
  const progress = await loadImmersionProgress(env, user);
  const rotated = applyImmersionPeriod(progress, data.period).rotated;
  if (data.examples !== undefined && !rotated) progress.examples = clampQuestExamples(data.examples);
  if (data.seenKey !== undefined && !rotated) progress.seenKey = String(data.seenKey || "").slice(0, 80);
  if (data.advanceMode !== undefined) progress.advanceMode = normalizeAdvanceMode(data.advanceMode);
  progress.updatedAt = new Date().toISOString();
  await putImmersionProgress(env, progress);
  return { today, total: IMMERSION_QUEST_TOTAL, progress };
}

/**
 * Complete / advance immersion quest.
 * - auto mode (default): Complete advances + burns the PC-local day.
 * - manual mode + advance:false: save examples only (no advance, no day burn).
 * - manual mode + advance:true (Next quest): advances + burns the PC-local day.
 * Daily gate uses client-reported local ymd (validated), not Tokyo-only.
 */
export async function completeImmersionQuest(
  env: KvEnv,
  data: {
    username?: string;
    examples?: unknown;
    day?: unknown;
    key?: string;
    ymd?: unknown;
    advance?: unknown;
    advanceMode?: unknown;
    period?: unknown;
  }
): Promise<{ today: string; total: number; progress: ImmersionQuestProgress }> {
  const user = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");

  const progress = await loadImmersionProgress(env, user);
  if (data.advanceMode !== undefined) {
    progress.advanceMode = normalizeAdvanceMode(data.advanceMode);
  }
  applyImmersionPeriod(progress, data.period);
  const today = resolveImmersionTodayYmd(data.ymd);
  if (progress.currentIndex >= IMMERSION_QUEST_TOTAL) throw new Error("ALL_DONE");

  const mode = progress.advanceMode || "auto";
  const wantAdvance = mode === "auto" || data.advance === true;

  // Manual Complete: log examples / mark practice without advancing or burning the day.
  if (!wantAdvance) {
    progress.examples = clampQuestExamples(data.examples);
    progress.updatedAt = new Date().toISOString();
    await putImmersionProgress(env, progress);
    return { today, total: IMMERSION_QUEST_TOTAL, progress };
  }

  /* One advance per week. The week change above clears this, so a value means "done this week". */
  if (progress.lastCompletedYmd) throw new Error("ALREADY_DONE_TODAY");

  const day = progress.currentIndex + 1;
  if (data.day != null && Number(data.day) !== day) throw new Error("QUEST_STALE");

  const examples = clampQuestExamples(data.examples);

  const key = String(data.key || day);
  progress.completed.push({
    day,
    id: String(key.split(":")[1] || ""),
    key,
    ymd: today,
    examples,
  });
  if (!progress.puzzlePieces.includes(day)) progress.puzzlePieces.push(day);
  progress.currentIndex = day;
  progress.lastCompletedYmd = today;
  progress.seenKey = key;
  progress.examples = ["", "", "", "", ""];
  progress.updatedAt = new Date().toISOString();
  await putImmersionProgress(env, progress);
  return { today, total: IMMERSION_QUEST_TOTAL, progress };
}

/** Explicit Next-quest advance (manual mode). Same day gate as complete-with-advance. */
export async function advanceImmersionQuest(
  env: KvEnv,
  data: {
    username?: string;
    examples?: unknown;
    day?: unknown;
    key?: string;
    ymd?: unknown;
    advanceMode?: unknown;
  }
): Promise<{ today: string; total: number; progress: ImmersionQuestProgress }> {
  return completeImmersionQuest(env, { ...data, advance: true });
}

/** Student Kanji Notebook — one character per genkouyoushi square, paged. */

const kanjiNotebookKey = (username: string) => `hw-kanji-notebook:${username}`;

const KANJI_NOTEBOOK_MAX_CHARS = 8000;
const KANJI_NOTEBOOK_MAX_PAGES = 40;

export interface KanjiNotebookPage {
  text: string;
  updatedAt: string;
}

export interface KanjiNotebookStore {
  username: string;
  pages: Record<string, KanjiNotebookPage>;
  updatedAt: string;
}

export interface KanjiNotebookSaveInput {
  username?: string;
  page?: number | string;
  text?: string;
}

function normalizeKanjiPageIndex(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "0"), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), KANJI_NOTEBOOK_MAX_PAGES - 1);
}

async function loadKanjiNotebookStore(
  env: KvEnv,
  username: string
): Promise<KanjiNotebookStore> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(user, kv))) throw new Error("UNKNOWN_STUDENT");

  const raw = await kv.get(kanjiNotebookKey(user));
  if (!raw) {
    return { username: user, pages: {}, updatedAt: "" };
  }
  try {
    const parsed = JSON.parse(raw) as KanjiNotebookStore;
    const pages =
      parsed?.pages && typeof parsed.pages === "object" && !Array.isArray(parsed.pages)
        ? parsed.pages
        : {};
    return {
      username: user,
      pages,
      updatedAt: String(parsed?.updatedAt || ""),
    };
  } catch {
    return { username: user, pages: {}, updatedAt: "" };
  }
}

function listKanjiNotebookPageIndexes(store: KanjiNotebookStore): number[] {
  const keys = Object.keys(store.pages)
    .map((k) => normalizeKanjiPageIndex(k))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => a - b);
  /* Always expose at least page 0 so a blank book is writable. */
  if (!keys.includes(0)) keys.unshift(0);
  return keys;
}

export async function getKanjiNotebook(
  env: KvEnv,
  opts: { username: string; page?: number | string }
): Promise<{
  username: string;
  page: number;
  text: string;
  updatedAt: string;
  pages: number[];
  /** Saved page texts for client-side notebook search (page index → text). */
  pageTexts: Record<string, string>;
}> {
  const store = await loadKanjiNotebookStore(env, opts.username);
  const page = normalizeKanjiPageIndex(opts.page ?? 0);
  const entry = store.pages[String(page)];
  const pages = listKanjiNotebookPageIndexes(store);
  /* If requesting a page past the last filled+1, still allow current blank page. */
  if (!pages.includes(page)) pages.push(page);
  pages.sort((a, b) => a - b);
  const pageTexts: Record<string, string> = {};
  for (const [k, v] of Object.entries(store.pages)) {
    const idx = normalizeKanjiPageIndex(k);
    pageTexts[String(idx)] = String(v?.text || "");
  }

  return {
    username: store.username,
    page,
    text: String(entry?.text || ""),
    updatedAt: String(entry?.updatedAt || ""),
    pages,
    pageTexts,
  };
}

export async function saveKanjiNotebook(
  data: KanjiNotebookSaveInput,
  env: KvEnv
): Promise<{
  username: string;
  page: number;
  text: string;
  updatedAt: string;
  pages: number[];
  pageTexts: Record<string, string>;
}> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!username) throw new Error("USERNAME_REQUIRED");
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const page = normalizeKanjiPageIndex(data.page ?? 0);
  const text = String(data.text ?? "");
  if (text.length > KANJI_NOTEBOOK_MAX_CHARS) throw new Error("TEXT_TOO_LONG");

  const store = await loadKanjiNotebookStore(env, username);
  const now = new Date().toISOString();
  if (!text.trim()) {
    delete store.pages[String(page)];
  } else {
    store.pages[String(page)] = { text, updatedAt: now };
  }
  store.updatedAt = now;
  store.username = username;

  await kv.put(kanjiNotebookKey(username), JSON.stringify(store));

  return getKanjiNotebook(env, { username, page });
}

/** In-progress worksheet comments (synced per student account). */

const homeworkCommentsDraftKey = (username: string, assignmentId: string) =>
  `hw-comments-draft:${username}:${assignmentId}`;

export interface HomeworkCommentsDraft {
  username: string;
  assignmentId: string;
  comments: HomeworkComment[];
  updatedAt: string;
}

export interface HomeworkCommentsDraftSaveInput {
  username?: string;
  assignmentId?: string;
  comments?: HomeworkComment[];
}

export async function loadHomeworkCommentsDraft(
  env: KvEnv,
  username: string,
  assignmentId: string
): Promise<HomeworkCommentsDraft | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(username || "")
    .trim()
    .toLowerCase();
  const id = String(assignmentId || "").trim();
  if (!user || !id) return null;

  const raw = await kv.get(homeworkCommentsDraftKey(user, id));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as HomeworkCommentsDraft;
    if (draft.username !== user || draft.assignmentId !== id) return null;
    if (!Array.isArray(draft.comments)) draft.comments = [];
    return draft;
  } catch {
    return null;
  }
}

export async function saveHomeworkCommentsDraft(
  data: HomeworkCommentsDraftSaveInput,
  env: KvEnv
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const assignmentId = String(data.assignmentId || "").trim();
  if (!assignmentId) throw new Error("ASSIGNMENT_REQUIRED");

  const comments = Array.isArray(data.comments) ? data.comments : [];

  const draft: HomeworkCommentsDraft = {
    username,
    assignmentId,
    comments,
    updatedAt: new Date().toISOString(),
  };

  await kv.put(homeworkCommentsDraftKey(username, assignmentId), JSON.stringify(draft));
}

export async function deleteHomeworkCommentsDraft(
  env: KvEnv,
  username: string,
  assignmentId: string
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const user = String(username || "")
    .trim()
    .toLowerCase();
  const id = String(assignmentId || "").trim();
  if (!user || !id) return;

  await kv.delete(homeworkCommentsDraftKey(user, id));
}

export async function loadHomeworkSubmissionVideo(
  teacherUsername: string | undefined,
  videoId: string,
  env: KvEnv
): Promise<{ body: ArrayBuffer; mimeType: string; name?: string } | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(videoId || "").trim();
  if (!id) return null;

  const metaRaw = await kv.get(submissionVideoMetaKey(id));
  const body = await kv.get(submissionVideoKey(id), "arrayBuffer");
  if (!metaRaw || !body) return null;

  try {
    const meta = JSON.parse(metaRaw) as { mimeType?: string; name?: string };
    return {
      body,
      mimeType: meta.mimeType || "application/octet-stream",
      name: meta.name,
    };
  } catch {
    return null;
  }
}

/** Promo email signups (website popup). */

const PROMO_INDEX = "promo-signups-index";
const promoSignupKey = (id: string) => `promo-signup:${id}`;
const promoEmailLookupKey = (email: string) => `promo-email:${email}`;

export interface PromoSignup {
  id: string;
  name?: string;
  email: string;
  page: string;
  /** Selected interest keys: lesson-discounts | new-learning-games | other */
  interests?: string[];
  /** Free text when interests includes "other" */
  interestOther?: string;
  signedUpAt: string;
}

function normalizePromoEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function makePromoSignupId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `promo-${Date.now()}-${rand}`;
}

async function readPromoIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(PROMO_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writePromoIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(PROMO_INDEX, JSON.stringify(unique));
}

export async function savePromoSignup(
  data: {
    email: string;
    name?: string;
    page?: string;
    interests?: string[];
    interestOther?: string;
  },
  env: KvEnv
): Promise<{ id: string; duplicate: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const email = String(data.email || "").trim();
  const normalized = normalizePromoEmail(email);
  if (!normalized) throw new Error("EMAIL_REQUIRED");

  const name = String(data.name || "").trim();
  const interests = Array.isArray(data.interests)
    ? data.interests.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const interestOther = String(data.interestOther || "").trim().slice(0, 200);

  const existingId = await kv.get(promoEmailLookupKey(normalized));
  if (existingId) {
    const raw = await kv.get(promoSignupKey(existingId));
    if (raw) {
      try {
        const record = JSON.parse(raw) as PromoSignup;
        let changed = false;
        if (name) {
          const merged = [record.name, name].filter(Boolean).join("; ");
          if (merged && merged !== record.name) {
            record.name = merged;
            changed = true;
          }
        }
        if (interests.length) {
          const prev = Array.isArray(record.interests) ? record.interests : [];
          const mergedInterests = [...new Set([...prev, ...interests])].slice(0, 8);
          if (mergedInterests.join("|") !== prev.join("|")) {
            record.interests = mergedInterests;
            changed = true;
          }
        }
        if (interestOther && interestOther !== record.interestOther) {
          record.interestOther = interestOther;
          changed = true;
        }
        if (changed) {
          await kv.put(promoSignupKey(existingId), JSON.stringify(record));
        }
      } catch {
        /* ignore corrupt entry */
      }
    }
    return { id: existingId, duplicate: true };
  }

  const id = makePromoSignupId();
  const record: PromoSignup = {
    id,
    email,
    ...(name ? { name } : {}),
    page: String(data.page || "").trim() || "Unknown",
    signedUpAt: new Date().toISOString(),
  };
  if (interests.length) record.interests = interests;
  if (interestOther) record.interestOther = interestOther;

  await kv.put(promoSignupKey(id), JSON.stringify(record));
  await kv.put(promoEmailLookupKey(normalized), id);

  const ids = await readPromoIndex(kv);
  ids.unshift(id);
  await writePromoIndex(kv, ids);

  return { id, duplicate: false };
}

/**
 * Index is newest-first, so a limit reads only the newest rows. The Teacher Hub
 * feed passes one; the Email list panel omits it and still gets everything.
 */
export async function listPromoSignups(
  env: KvEnv,
  opts?: { limit?: number }
): Promise<PromoSignup[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const limit = Number(opts?.limit) > 0 ? Math.min(500, Number(opts.limit)) : 0;
  const all = await readPromoIndex(kv);
  const ids = limit ? all.slice(0, limit) : all;
  const signups: PromoSignup[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(promoSignupKey(id));
      if (!raw) return;
      try {
        signups.push(JSON.parse(raw) as PromoSignup);
      } catch {
        /* skip corrupt entry */
      }
    })
  );

  return signups.sort(
    (a, b) => new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime()
  );
}

/** Student hub feature requests / bug reports → Teacher Hub Home feed. */

const FEATURE_REPORT_INDEX = "feature-reports-index";
const featureReportKey = (id: string) => `feature-report:${id}`;
const featureReportImageKey = (id: string) => `feature-report-image:${id}`;

const MAX_FEATURE_IMAGE_BYTES = 900_000;

export type FeatureReportKind = "feature" | "bug" | "reminder";

export interface FeatureReport {
  id: string;
  kind: FeatureReportKind;
  message: string;
  username?: string;
  displayName?: string;
  page?: string;
  createdAt: string;
  /** True when a screenshot/image was stored under feature-report-image:{id}. */
  hasImage?: boolean;
}

export interface FeatureReportPayload {
  kind?: string;
  message?: string;
  username?: string;
  displayName?: string;
  page?: string;
  /** Optional data-URL or raw base64 (jpeg/png/webp). Stored separately from the list record. */
  imageBase64?: string;
}

function makeFeatureReportId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `fr-${Date.now()}-${rand}`;
}

function normalizeFeatureReportKind(raw: string | undefined): FeatureReportKind | null {
  const k = String(raw || "")
    .trim()
    .toLowerCase();
  if (k === "feature" || k === "feature-request" || k === "feature_request") return "feature";
  if (k === "bug" || k === "bug-report" || k === "bug_report") return "bug";
  if (k === "reminder" || k === "social" || k === "social-reminder") return "reminder";
  return null;
}

async function readFeatureReportIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(FEATURE_REPORT_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writeFeatureReportIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(FEATURE_REPORT_INDEX, JSON.stringify(unique.slice(0, 200)));
}

export interface FeatureReportImage {
  contentType: string;
  bytes: Uint8Array;
}

function parseFeatureReportImage(
  raw: string | undefined
): { contentType: string; bytes: Uint8Array } | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  let contentType = "image/jpeg";
  let b64 = s;
  const dataUrl = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(s);
  if (dataUrl) {
    contentType = dataUrl[1].toLowerCase().replace("image/jpg", "image/jpeg");
    b64 = dataUrl[2];
  } else if (/^image\/(?:jpeg|jpg|png|webp);base64,/i.test(s)) {
    const parts = s.split(",");
    contentType = parts[0]
      .split(";")[0]
      .toLowerCase()
      .replace("image/jpg", "image/jpeg");
    b64 = parts.slice(1).join(",");
  }

  b64 = b64.replace(/\s/g, "");
  if (!b64 || b64.length > Math.ceil(MAX_FEATURE_IMAGE_BYTES * 1.4)) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new Error("IMAGE_INVALID");
  }
  if (binary.length > MAX_FEATURE_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { contentType, bytes };
}

export async function saveFeatureReport(
  data: FeatureReportPayload,
  env: KvEnv
): Promise<FeatureReport> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const kind = normalizeFeatureReportKind(data.kind);
  if (!kind) throw new Error("KIND_REQUIRED");

  let message = String(data.message || "").trim();
  if (!message && kind === "bug") {
    message = "(No comment — screenshot only)";
  }
  if (!message) throw new Error("MESSAGE_REQUIRED");
  if (message.length > 4000) throw new Error("MESSAGE_TOO_LONG");

  const parsedImage = parseFeatureReportImage(data.imageBase64);

  const id = makeFeatureReportId();
  const record: FeatureReport = {
    id,
    kind,
    message: message.slice(0, 4000),
    createdAt: new Date().toISOString(),
  };
  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  const displayName = String(data.displayName || "").trim();
  const page = String(data.page || "").trim();
  if (username) record.username = username.slice(0, 64);
  if (displayName) record.displayName = displayName.slice(0, 120);
  if (page) record.page = page.slice(0, 200);
  if (parsedImage) record.hasImage = true;

  await kv.put(featureReportKey(id), JSON.stringify(record));
  if (parsedImage) {
    await kv.put(featureReportImageKey(id), parsedImage.bytes, {
      metadata: { contentType: parsedImage.contentType },
    });
  }
  const ids = await readFeatureReportIndex(kv);
  ids.unshift(id);
  await writeFeatureReportIndex(kv, ids);
  return record;
}

export async function loadFeatureReportImage(
  id: string,
  env: KvEnv
): Promise<FeatureReportImage | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const safeId = String(id || "").trim();
  if (!safeId) return null;

  const res = await kv.getWithMetadata(featureReportImageKey(safeId), "arrayBuffer");
  if (!res.value) return null;
  const meta = (res.metadata || {}) as { contentType?: string };
  const contentType =
    String(meta.contentType || "image/jpeg").trim() || "image/jpeg";
  return { contentType, bytes: new Uint8Array(res.value) };
}

export async function listFeatureReports(
  env: KvEnv,
  opts?: { limit?: number }
): Promise<FeatureReport[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const limit = Math.max(1, Math.min(100, Number(opts?.limit) || 40));
  const ids = (await readFeatureReportIndex(kv)).slice(0, limit);
  const reports: FeatureReport[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(featureReportKey(id));
      if (!raw) return;
      try {
        reports.push(JSON.parse(raw) as FeatureReport);
      } catch {
        /* skip */
      }
    })
  );

  return reports.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export interface PromoSignupSavePayload {
  teacherUsername?: string;
  id?: string;
  name?: string;
  email: string;
  page?: string;
}

export interface PromoSignupDeletePayload {
  teacherUsername?: string;
  id?: string;
}

export async function savePromoSignupTeacher(
  data: PromoSignupSavePayload,
  env: KvEnv
): Promise<{ id: string; updated: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const email = String(data.email || "").trim();
  const normalized = normalizePromoEmail(email);
  if (!normalized) throw new Error("EMAIL_REQUIRED");

  const name = String(data.name || "").trim();
  const page = String(data.page || "").trim() || "Manual";
  const id = String(data.id || "").trim();

  if (id) {
    const raw = await kv.get(promoSignupKey(id));
    if (!raw) throw new Error("NOT_FOUND");

    let record: PromoSignup;
    try {
      record = JSON.parse(raw) as PromoSignup;
    } catch {
      throw new Error("NOT_FOUND");
    }

    const oldNormalized = normalizePromoEmail(record.email);
    if (normalized !== oldNormalized) {
      const clashId = await kv.get(promoEmailLookupKey(normalized));
      if (clashId && clashId !== id) throw new Error("EMAIL_IN_USE");
      await kv.delete(promoEmailLookupKey(oldNormalized));
      await kv.put(promoEmailLookupKey(normalized), id);
    }

    record.email = email;
    if (name) record.name = name;
    else delete record.name;

    await kv.put(promoSignupKey(id), JSON.stringify(record));
    return { id, updated: true };
  }

  const existingId = await kv.get(promoEmailLookupKey(normalized));
  if (existingId) throw new Error("EMAIL_IN_USE");

  const newId = makePromoSignupId();
  const record: PromoSignup = {
    id: newId,
    email,
    ...(name ? { name } : {}),
    page,
    signedUpAt: new Date().toISOString(),
  };

  await kv.put(promoSignupKey(newId), JSON.stringify(record));
  await kv.put(promoEmailLookupKey(normalized), newId);

  const ids = await readPromoIndex(kv);
  ids.unshift(newId);
  await writePromoIndex(kv, ids);

  return { id: newId, updated: false };
}

export async function deletePromoSignup(
  data: PromoSignupDeletePayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.id || "").trim();
  if (!id) throw new Error("ID_REQUIRED");

  const raw = await kv.get(promoSignupKey(id));
  if (!raw) throw new Error("NOT_FOUND");

  let record: PromoSignup;
  try {
    record = JSON.parse(raw) as PromoSignup;
  } catch {
    throw new Error("NOT_FOUND");
  }

  await kv.delete(promoSignupKey(id));
  await kv.delete(promoEmailLookupKey(normalizePromoEmail(record.email)));

  const ids = await readPromoIndex(kv);
  await writePromoIndex(
    kv,
    ids.filter((entry) => entry !== id)
  );

  return { id };
}

/** Student lesson mistakes — tracked per student for review and future homework. */

const MISTAKES_INDEX = "mistakes-index";
const mistakeKey = (id: string) => `mistake:${id}`;
const studentMistakesIndexKey = (username: string) =>
  `mistakes-student:${username.toLowerCase()}`;

export type StudentMistakeCategory =
  | "grammar"
  | "vocab"
  | "pronunciation"
  | "kanji"
  | "particle"
  | "conjugation"
  | "other";

export type StudentMistakeStatus = "active" | "resolved";

export interface StudentMistake {
  id: string;
  username: string;
  displayName?: string;
  category: StudentMistakeCategory;
  text: string;
  correction?: string;
  context?: string;
  source?: "lesson" | "homework" | "speaking";
  lessonName?: string;
  assignmentId?: string;
  status: StudentMistakeStatus;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentMistakePayload {
  teacherUsername?: string;
  mistakesKey?: string;
  id?: string;
  studentUsername?: string;
  displayName?: string;
  category?: string;
  text?: string;
  correction?: string;
  context?: string;
  source?: string;
  lessonName?: string;
  assignmentId?: string;
  status?: StudentMistakeStatus;
}

export interface StudentMistakeDeletePayload {
  teacherUsername?: string;
  mistakesKey?: string;
  id?: string;
}

export interface StudentMistakeResolvePayload {
  username?: string;
  id?: string;
}

const MISTAKE_CATEGORIES = new Set<StudentMistakeCategory>([
  "grammar",
  "vocab",
  "pronunciation",
  "kanji",
  "particle",
  "conjugation",
  "other",
]);

function makeMistakeId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `mist-${Date.now()}-${rand}`;
}

function normalizeMistakeCategory(raw: string | undefined): StudentMistakeCategory {
  const cat = String(raw || "grammar")
    .trim()
    .toLowerCase() as StudentMistakeCategory;
  return MISTAKE_CATEGORIES.has(cat) ? cat : "other";
}

async function readMistakesIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(MISTAKES_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writeMistakesIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(MISTAKES_INDEX, JSON.stringify(unique));
}

async function readStudentMistakesIndex(
  kv: KVNamespace,
  student: string
): Promise<string[] | null> {
  const raw = await kv.get(studentMistakesIndexKey(student));
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
}

async function writeStudentMistakesIndex(
  kv: KVNamespace,
  student: string,
  ids: string[]
): Promise<void> {
  await kv.put(
    studentMistakesIndexKey(student),
    JSON.stringify([...new Set(ids.filter(Boolean))])
  );
}

async function addStudentMistakesIndexId(
  kv: KVNamespace,
  student: string,
  id: string
): Promise<void> {
  const key = student.toLowerCase();
  let ids = (await readStudentMistakesIndex(kv, key)) || [];
  if (!ids.length) {
    ids = await buildStudentMistakesIndex(kv, key);
  }
  if (!ids.includes(id)) {
    ids.unshift(id);
    await writeStudentMistakesIndex(kv, key, ids);
  }
}

async function removeStudentMistakesIndexId(
  kv: KVNamespace,
  student: string,
  id: string
): Promise<void> {
  const key = student.toLowerCase();
  const ids = await readStudentMistakesIndex(kv, key);
  if (!ids?.length) return;
  const next = ids.filter((entry) => entry !== id);
  await writeStudentMistakesIndex(kv, key, next);
}

async function buildStudentMistakesIndex(
  kv: KVNamespace,
  student: string
): Promise<string[]> {
  const filterStudent = student.toLowerCase();
  const ids = await readMistakesIndex(kv);
  const studentIds: string[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(mistakeKey(id));
      if (!raw) return;
      try {
        const entry = JSON.parse(raw) as StudentMistake;
        if (entry.username === filterStudent) studentIds.push(id);
      } catch {
        /* skip */
      }
    })
  );
  studentIds.sort((a, b) => b.localeCompare(a));
  await writeStudentMistakesIndex(kv, filterStudent, studentIds);
  return studentIds;
}

async function ensureStudentMistakesIndex(
  kv: KVNamespace,
  student: string
): Promise<string[]> {
  const existing = await readStudentMistakesIndex(kv, student);
  if (existing) return existing;
  return buildStudentMistakesIndex(kv, student);
}

async function loadMistakesByIds(
  kv: KVNamespace,
  ids: string[]
): Promise<StudentMistake[]> {
  const rows = await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(mistakeKey(id));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StudentMistake;
      } catch {
        return null;
      }
    })
  );
  return rows.filter((e): e is StudentMistake => Boolean(e));
}

export async function listStudentMistakes(
  env: KvEnv,
  opts?: { student?: string; status?: string }
): Promise<StudentMistake[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const filterStudent = String(opts?.student || "")
    .trim()
    .toLowerCase();
  const filterStatus = String(opts?.status || "").trim().toLowerCase();

  if (filterStudent) {
    const ids = await ensureStudentMistakesIndex(kv, filterStudent);
    let mistakes = await loadMistakesByIds(kv, ids);
    if (filterStatus) {
      mistakes = mistakes.filter((entry) => entry.status === filterStatus);
    }
    return mistakes;
  }

  const ids = await readMistakesIndex(kv);
  const mistakes = await loadMistakesByIds(kv, ids);
  if (!filterStatus) return mistakes;
  return mistakes.filter((entry) => entry.status === filterStatus);
}

export async function saveStudentMistake(
  data: StudentMistakePayload,
  env: KvEnv
): Promise<{ id: string; updated: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacherMistakesAccess(data, env)) throw new Error("TEACHER_ONLY");

  const text = String(data.text || "").trim();
  if (!text) throw new Error("CONTENT_REQUIRED");

  const category = normalizeMistakeCategory(data.category);
  const status: StudentMistakeStatus =
    data.status === "resolved" ? "resolved" : "active";
  const now = new Date().toISOString();
  const existingId = String(data.id || "").trim();
  let id = existingId;
  let updated = false;

  if (id) {
    const raw = await kv.get(mistakeKey(id));
    if (!raw) throw new Error("NOT_FOUND");
    let prev: StudentMistake;
    try {
      prev = JSON.parse(raw) as StudentMistake;
    } catch {
      throw new Error("NOT_FOUND");
    }

    const resolvedAt =
      status === "resolved"
        ? prev.status === "resolved"
          ? prev.resolvedAt || now
          : now
        : undefined;

    const mistake: StudentMistake = {
      ...prev,
      category,
      text,
      correction: String(data.correction || "").trim() || undefined,
      context: String(data.context || "").trim() || undefined,
      source: (data.source as StudentMistake["source"]) || prev.source || "lesson",
      lessonName: String(data.lessonName || "").trim() || prev.lessonName,
      assignmentId: String(data.assignmentId || "").trim() || prev.assignmentId,
      status,
      resolvedAt,
      updatedAt: now,
    };
    await kv.put(mistakeKey(id), JSON.stringify(mistake));
    updated = true;
  } else {
    const username = String(data.studentUsername || "")
      .trim()
      .toLowerCase();
    if (!username) throw new Error("STUDENT_REQUIRED");
    if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

    id = makeMistakeId();
    const mistake: StudentMistake = {
      id,
      username,
      displayName: String(data.displayName || "").trim() || undefined,
      category,
      text,
      correction: String(data.correction || "").trim() || undefined,
      context: String(data.context || "").trim() || undefined,
      source: (data.source as StudentMistake["source"]) || "lesson",
      lessonName: String(data.lessonName || "").trim() || undefined,
      assignmentId: String(data.assignmentId || "").trim() || undefined,
      status,
      resolvedAt: status === "resolved" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await kv.put(mistakeKey(id), JSON.stringify(mistake));
    const index = await readMistakesIndex(kv);
    index.unshift(id);
    await writeMistakesIndex(kv, index);
    await addStudentMistakesIndexId(kv, username, id);
  }

  return { id, updated };
}

export async function deleteStudentMistake(
  data: StudentMistakeDeletePayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacherMistakesAccess(data, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.id || "").trim();
  if (!id) throw new Error("ID_REQUIRED");

  const raw = await kv.get(mistakeKey(id));
  if (!raw) throw new Error("NOT_FOUND");

  let deletedUsername = "";
  try {
    deletedUsername = (JSON.parse(raw) as StudentMistake).username || "";
  } catch {
    /* ignore */
  }

  await kv.delete(mistakeKey(id));
  const ids = await readMistakesIndex(kv);
  await writeMistakesIndex(
    kv,
    ids.filter((entry) => entry !== id)
  );
  if (deletedUsername) {
    await removeStudentMistakesIndexId(kv, deletedUsername, id);
  }

  return { id };
}

export async function resolveStudentMistake(
  data: StudentMistakeResolvePayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  const id = String(data.id || "").trim();
  if (!username || !id) throw new Error("ID_REQUIRED");
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const raw = await kv.get(mistakeKey(id));
  if (!raw) throw new Error("NOT_FOUND");

  let mistake: StudentMistake;
  try {
    mistake = JSON.parse(raw) as StudentMistake;
  } catch {
    throw new Error("NOT_FOUND");
  }

  if (mistake.username !== username) throw new Error("FORBIDDEN");

  const now = new Date().toISOString();
  mistake.status = "resolved";
  mistake.resolvedAt = now;
  mistake.updatedAt = now;
  await kv.put(mistakeKey(id), JSON.stringify(mistake));

  return { id };
}

/** Student moves a trashed mistake back to their active list. */
export async function restoreStudentMistake(
  data: StudentMistakeResolvePayload,
  env: KvEnv
): Promise<{ id: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  const id = String(data.id || "").trim();
  if (!username || !id) throw new Error("ID_REQUIRED");
  if (!(await isKnownStudentInKv(username, kv))) throw new Error("UNKNOWN_STUDENT");

  const raw = await kv.get(mistakeKey(id));
  if (!raw) throw new Error("NOT_FOUND");

  let mistake: StudentMistake;
  try {
    mistake = JSON.parse(raw) as StudentMistake;
  } catch {
    throw new Error("NOT_FOUND");
  }

  if (mistake.username !== username) throw new Error("FORBIDDEN");

  const now = new Date().toISOString();
  mistake.status = "active";
  mistake.resolvedAt = undefined;
  mistake.updatedAt = now;
  await kv.put(mistakeKey(id), JSON.stringify(mistake));

  return { id };
}

/** Lantern Word Hunt — editable word lists per study set (teacher hub → Game lab). */

export interface LanternWord {
  word: string;
  reading: string;
  en: string;
}

export interface LanternWordSetSummary {
  id: string;
  label: string;
  wordCount: number;
  updatedAt?: string;
  builtin?: boolean;
}

export interface LanternWordSetSavePayload {
  teacherUsername?: string;
  setId?: string;
  label?: string;
  words?: LanternWord[];
}

export interface LanternWordSetDeletePayload {
  teacherUsername?: string;
  setId?: string;
}

const LANTERN_SETS_INDEX = "lantern-words-sets-index";
const lanternSetKey = (id: string) => `lantern-words-set:${id}`;

const BUILTIN_LANTERN_SETS: Record<string, { label: string }> = {
  demo: { label: "Demo words" },
  n5: { label: "JLPT N5 words" },
};

function normalizeLanternSetId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function isValidLanternSetId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,31}$/.test(id);
}

function sanitizeLanternWords(words: unknown): LanternWord[] {
  if (!Array.isArray(words)) return [];
  const out: LanternWord[] = [];
  for (const item of words) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const word = String(row.word || "").trim();
    const reading = String(row.reading || "")
      .trim()
      .split(/\s*[／/]\s*/)[0]
      .trim();
    const en = String(row.en || "").trim();
    if (!word || !reading) continue;
    out.push({ word, reading, en });
  }
  return out;
}

async function readLanternSetIds(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(LANTERN_SETS_INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((id) => normalizeLanternSetId(String(id))).filter(isValidLanternSetId)
      : [];
  } catch {
    return [];
  }
}

async function writeLanternSetIds(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(isValidLanternSetId))];
  await kv.put(LANTERN_SETS_INDEX, JSON.stringify(unique));
}

export async function listLanternWordSets(env: KvEnv): Promise<LanternWordSetSummary[]> {
  const kv = env.HOMEWORK_KV;
  const summaries: LanternWordSetSummary[] = [];

  for (const [id, meta] of Object.entries(BUILTIN_LANTERN_SETS)) {
    summaries.push({ id, label: meta.label, wordCount: 0, builtin: true });
  }

  if (!kv) return summaries;

  const customIds = await readLanternSetIds(kv);
  for (const id of customIds) {
    if (BUILTIN_LANTERN_SETS[id]) continue;
    const raw = await kv.get(lanternSetKey(id));
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as { label?: string; words?: LanternWord[]; updatedAt?: string };
      summaries.push({
        id,
        label: String(data.label || id).trim() || id,
        wordCount: Array.isArray(data.words) ? data.words.length : 0,
        updatedAt: data.updatedAt,
      });
    } catch {
      /* skip corrupt */
    }
  }

  for (const summary of summaries) {
    const raw = await kv.get(lanternSetKey(summary.id));
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as { words?: LanternWord[]; updatedAt?: string; label?: string };
      summary.wordCount = Array.isArray(data.words) ? data.words.length : 0;
      if (data.updatedAt) summary.updatedAt = data.updatedAt;
      if (data.label && summary.builtin) summary.label = String(data.label).trim() || summary.label;
    } catch {
      /* ignore */
    }
  }

  return summaries;
}

export async function loadLanternWords(
  setId: string,
  env: KvEnv
): Promise<{ setId: string; label: string; words: LanternWord[] | null; source: "kv" | "none" }> {
  const id = normalizeLanternSetId(setId);
  if (!isValidLanternSetId(id)) throw new Error("INVALID_SET");

  const label = BUILTIN_LANTERN_SETS[id]?.label || id;

  const kv = env.HOMEWORK_KV;
  if (!kv) {
    return { setId: id, label, words: null, source: "none" };
  }

  const raw = await kv.get(lanternSetKey(id));
  if (!raw) {
    return { setId: id, label, words: null, source: "none" };
  }

  try {
    const data = JSON.parse(raw) as { label?: string; words?: LanternWord[] };
    const words = sanitizeLanternWords(data.words);
    return {
      setId: id,
      label: String(data.label || label).trim() || label,
      words,
      source: "kv",
    };
  } catch {
    return { setId: id, label, words: null, source: "none" };
  }
}

export async function saveLanternWords(
  data: LanternWordSetSavePayload,
  env: KvEnv
): Promise<{ setId: string; wordCount: number }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const setId = normalizeLanternSetId(String(data.setId || ""));
  if (!isValidLanternSetId(setId)) throw new Error("INVALID_SET");

  const words = sanitizeLanternWords(data.words);
  if (!words.length) throw new Error("WORDS_REQUIRED");

  const defaultLabel = BUILTIN_LANTERN_SETS[setId]?.label || setId;
  const label = String(data.label || defaultLabel).trim() || defaultLabel;
  const now = new Date().toISOString();

  await kv.put(
    lanternSetKey(setId),
    JSON.stringify({
      id: setId,
      label,
      words,
      updatedAt: now,
    })
  );

  if (!BUILTIN_LANTERN_SETS[setId]) {
    const ids = await readLanternSetIds(kv);
    if (!ids.includes(setId)) {
      ids.unshift(setId);
      await writeLanternSetIds(kv, ids);
    }
  }

  return { setId, wordCount: words.length };
}

export async function deleteLanternWordSet(
  data: LanternWordSetDeletePayload,
  env: KvEnv
): Promise<{ setId: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const setId = normalizeLanternSetId(String(data.setId || ""));
  if (!isValidLanternSetId(setId)) throw new Error("INVALID_SET");
  if (BUILTIN_LANTERN_SETS[setId]) throw new Error("BUILTIN_SET");

  await kv.delete(lanternSetKey(setId));
  const ids = await readLanternSetIds(kv);
  await writeLanternSetIds(
    kv,
    ids.filter((id) => id !== setId)
  );

  return { setId };
}

async function listKvKeysWithPrefix(kv: KVNamespace, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const entry of page.keys) keys.push(entry.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

export interface WipeStudentResult {
  username: string;
  catalogSheetsScrubbed: number;
  submissionsRemoved: number;
  mistakesRemoved: number;
  keysDeleted: number;
  accountDeleted: boolean;
  stillInCodeDemoList: boolean;
}

export interface DeleteHomeworkSubmissionResult {
  id: string;
  username: string;
}

/**
 * Teacher-only: remove one submission + photo/video blobs and drop it from
 * the global + per-student indexes.
 */
export async function deleteHomeworkSubmission(
  data: { teacherUsername?: string; submissionId?: string },
  env: KvEnv
): Promise<DeleteHomeworkSubmissionResult> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const id = String(data.submissionId || "").trim();
  if (!id) throw new Error("ID_REQUIRED");

  const raw = await kv.get(submissionKey(id));
  let username = "";
  if (raw) {
    try {
      username = String((JSON.parse(raw) as HomeworkSubmission).username || "")
        .trim()
        .toLowerCase();
    } catch {
      /* still delete keys / indexes */
    }
  }

  const globalSubs = await readSubmissionsIndex(kv);
  const inGlobal = globalSubs.includes(id);
  if (!raw && !inGlobal) throw new Error("NOT_FOUND");

  await kv.delete(submissionKey(id));
  await kv.delete(submissionPhotoKey(id));
  await kv.delete(submissionPhotoMetaKey(id));
  await kv.delete(submissionVideoKey(id));
  await kv.delete(submissionVideoMetaKey(id));

  if (inGlobal) {
    await writeSubmissionsIndex(
      kv,
      globalSubs.filter((sid) => sid !== id)
    );
  }

  if (username) {
    const studentIds = await readStudentSubmissionsIndex(kv, username);
    if (studentIds?.includes(id)) {
      await writeStudentSubmissionsIndex(
        kv,
        username,
        studentIds.filter((sid) => sid !== id)
      );
    }
  }

  return { id, username };
}

/**
 * Full teacher wipe: scrub from every published sheet, delete submissions /
 * mistakes / notebooks / drafts / media / login. Confirm with confirmDelete === "DELETE".
 */
export async function wipeStudentCompletely(
  data: { teacherUsername?: string; studentUsername?: string; confirmDelete?: string },
  env: KvEnv
): Promise<WipeStudentResult> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  if (!isTeacher(data.teacherUsername, env)) throw new Error("TEACHER_ONLY");

  const user = String(data.studentUsername || "")
    .trim()
    .toLowerCase();
  if (!user) throw new Error("STUDENT_REQUIRED");
  if (user === String(env.HW_TEACHER_USER || TEACHER_DEFAULT).toLowerCase()) {
    throw new Error("CANNOT_WIPE_TEACHER");
  }
  if (String(data.confirmDelete || "").trim() !== "DELETE") {
    throw new Error("CONFIRM_REQUIRED");
  }

  let keysDeleted = 0;
  const del = async (key: string) => {
    await kv.delete(key);
    keysDeleted += 1;
  };

  /* 1. Scrub student off every published catalog (+ assignment if it mirrors students). */
  let catalogSheetsScrubbed = 0;
  const catalogIds = await readIndex(kv);
  for (const id of catalogIds) {
    const catRaw = await kv.get(catalogKey(id));
    if (catRaw) {
      try {
        const entry = JSON.parse(catRaw) as Record<string, unknown>;
        const students = Array.isArray(entry.students)
          ? (entry.students as unknown[]).map((s) => String(s || "").toLowerCase())
          : [];
        if (students.includes(user)) {
          entry.students = students.filter((s) => s !== user);
          await kv.put(catalogKey(id), JSON.stringify(entry));
          catalogSheetsScrubbed += 1;
        }
      } catch {
        /* skip corrupt */
      }
    }
    const asgRaw = await kv.get(assignmentKey(id));
    if (asgRaw) {
      try {
        const assignment = JSON.parse(asgRaw) as Record<string, unknown>;
        const students = Array.isArray(assignment.students)
          ? (assignment.students as unknown[]).map((s) => String(s || "").toLowerCase())
          : [];
        if (students.includes(user)) {
          assignment.students = students.filter((s) => s !== user);
          await kv.put(assignmentKey(id), JSON.stringify(assignment));
        }
      } catch {
        /* skip */
      }
    }
  }
  if (catalogSheetsScrubbed) {
    try {
      await kv.delete(KV_CATALOG_ENTRIES);
    } catch {
      /* next catalog load rebuilds */
    }
  }

  /* 2. Submissions + media */
  let submissionsRemoved = 0;
  const subIndex = (await readStudentSubmissionsIndex(kv, user)) || [];
  const globalSubs = await readSubmissionsIndex(kv);
  for (const subId of subIndex) {
    await del(submissionKey(subId));
    await del(submissionPhotoKey(subId));
    await del(submissionPhotoMetaKey(subId));
    await del(submissionVideoKey(subId));
    await del(submissionVideoMetaKey(subId));
    submissionsRemoved += 1;
  }
  await writeSubmissionsIndex(
    kv,
    globalSubs.filter((id) => !subIndex.includes(id))
  );
  await del(studentSubmissionsIndexKey(user));

  /* 3. Mistakes */
  let mistakesRemoved = 0;
  const mistakesRaw = await kv.get(studentMistakesIndexKey(user));
  let mistakeIds: string[] = [];
  if (mistakesRaw) {
    try {
      const parsed = JSON.parse(mistakesRaw) as string[];
      if (Array.isArray(parsed)) mistakeIds = parsed;
    } catch {
      /* ignore */
    }
  }
  for (const mid of mistakeIds) {
    await del(mistakeKey(mid));
    mistakesRemoved += 1;
  }
  const globalMistakes = await readMistakesIndex(kv);
  await writeMistakesIndex(
    kv,
    globalMistakes.filter((id) => !mistakeIds.includes(id))
  );
  await del(studentMistakesIndexKey(user));

  /* 4. Notebooks, drafts, media, settings, playlist cache */
  await del(dailyNotebookKey(user));
  await del(dailyExerciseKey(user));
  await del(kanjiNotebookKey(user));
  await del(immersionQuestKey(user));
  await del(studentYoutubeKey(user));
  await del(studentLessonPlaylistKey(user));
  await del(studentCurrentHomeworkKey(user));
  await del(studentHomeworkWaitingKey(user));
  await del(studentAccountSettingsKey(user));
  await del(studentDiscordKey(user));
  await del(studentTeacherListNameKey(user));

  for (const key of await listKvKeysWithPrefix(kv, `hw-draft:${user}:`)) {
    await del(key);
  }
  for (const key of await listKvKeysWithPrefix(kv, `hw-comments-draft:${user}:`)) {
    await del(key);
  }
  for (const key of await listKvKeysWithPrefix(kv, `student:${user}:playlist-latest`)) {
    await del(key);
  }

  /* 5. Login account */
  const accountResult = await deleteUserAccount(user, env);
  await markStudentWiped(kv, user);

  return {
    username: user,
    catalogSheetsScrubbed,
    submissionsRemoved,
    mistakesRemoved,
    keysDeleted,
    accountDeleted: accountResult.deleted,
    stillInCodeDemoList: STUDENT_ACCOUNTS.has(user),
  };
}
