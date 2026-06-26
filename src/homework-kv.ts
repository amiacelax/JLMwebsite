/** Published homework in KV (teacher → student hub, no git deploy). */

import { extractPlaylistId, fetchLatestVideoFromPlaylist } from "./youtube-playlist";
import {
  getUserAccount,
  updateUserAccountSettings,
  normalizeAccountLabel,
  normalizeAccountTier,
  type AccountLabel,
  type AccountTier,
} from "./user-accounts";

export interface StudentListEntry {
  username: string;
  displayName: string;
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
    }
  >;
  assignments?: Record<string, unknown>[];
}

const KV_INDEX = "catalog-index";
const assignmentKey = (id: string) => `assignment:${id}`;
const catalogKey = (id: string) => `catalog:${id}`;
const studentYoutubeKey = (username: string) => `student:${username}:youtube`;
const studentLessonPlaylistKey = (username: string) => `student:${username}:lesson-playlist`;
const studentCurrentHomeworkKey = (username: string) => `student:${username}:current-homework`;
const studentAccountSettingsKey = (username: string) => `student:${username}:account-settings`;
const playlistLatestCacheKey = (username: string, playlistId: string) =>
  `student:${username}:playlist-latest:${playlistId}`;

const PLAYLIST_LATEST_TTL_SEC = 3600;

export interface PublishPayload {
  teacherUsername?: string;
  studentUsername?: string;
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
  youtubeUrl?: string;
  lessonPlaylistUrl?: string;
}

export interface StudentProfilePayload {
  teacherUsername?: string;
  studentUsername?: string;
  youtubeUrl?: string;
  lessonPlaylistUrl?: string;
  accountLabel?: AccountLabel;
  tier?: AccountTier;
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
}

export interface SaveWorksheetPayload {
  teacherUsername?: string;
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
}

export interface DeleteWorksheetPayload {
  teacherUsername?: string;
  worksheetId?: string;
}

interface KvEnv {
  HOMEWORK_KV?: KVNamespace;
  HW_TEACHER_USER?: string;
  MISTAKES_LOG_KEY?: string;
}

const TEACHER_DEFAULT = "jlm";

/** Legacy demo students + teacher publish list (public/js/hw-auth.js ACCOUNTS). */
const STUDENT_ACCOUNTS = new Set(["benm", "joshs", "deme", "ivan", "benc", "noplan"]);

const LEGACY_STUDENT_LABELS: Record<string, string> = {
  benm: "Ben M",
  joshs: "Josh S",
  deme: "Deme",
  ivan: "Ivan",
  benc: "benc",
  noplan: "No Plan",
};

const USERS_INDEX = "user-accounts-index";

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

export async function listAllStudentAccounts(
  kv: KVNamespace
): Promise<StudentListEntry[]> {
  const byUser = new Map<string, StudentListEntry>();
  for (const username of STUDENT_ACCOUNTS) {
    byUser.set(username, {
      username,
      displayName: LEGACY_STUDENT_LABELS[username] || username,
    });
  }
  const ids = await readRegisteredUsernames(kv);
  for (const username of ids) {
    const key = String(username || "").trim().toLowerCase();
    if (!key || byUser.has(key)) continue;
    const raw = await kv.get(userAccountKey(key));
    if (!raw) continue;
    try {
      const account = JSON.parse(raw) as {
        username?: string;
        displayName?: string;
        role?: string;
      };
      if (account.role !== "student") continue;
      byUser.set(key, {
        username: account.username || key,
        displayName: account.displayName || account.username || key,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return [...byUser.values()].sort((a, b) =>
    a.username.localeCompare(b.username)
  );
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
  };
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
    const playlist = String(data.lessonPlaylistUrl || "").trim();
    if (playlist) {
      mediaOpts.lessonPlaylistUrl = playlist;
    }
  }
  if (Object.keys(mediaOpts).length) {
    await applyStudentMedia(kv, student, mediaOpts);
  }

  const playlist = String(data.lessonPlaylistUrl || "").trim();
  if (playlist) {
    await resolveLatestLessonFromPlaylist(kv, student, playlist, true);
  }

  if (data.accountLabel !== undefined || data.tier !== undefined) {
    await saveStudentAccountSettings(kv, student, {
      accountLabel: data.accountLabel,
      tier: data.tier,
    });
  }

  return { student };
}

export async function publishToStudentHub(
  data: PublishPayload,
  env: KvEnv,
  options?: { staticStudents?: string[] }
): Promise<{ id: string; studentUrl: string; updated: boolean }> {
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
  await kv.put(studentCurrentHomeworkKey(student), id);

  const index = await readIndex(kv);
  const updated = index.includes(id);
  if (!updated) {
    index.unshift(id);
    await writeIndex(kv, index);
  }

  return { id, studentUrl: `/homework/platform.html#hw-${id}`, updated };
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

  await kv.put(assignmentKey(id), JSON.stringify(assignment));
  await kv.put(catalogKey(id), JSON.stringify(catalogEntry));

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

  const index = await readIndex(kv);
  await writeIndex(
    kv,
    index.filter((entry) => entry !== id)
  );

  const allStudents = await listAllStudentAccounts(kv);
  for (const { username: student } of allStudents) {
    const current = await kv.get(studentCurrentHomeworkKey(student));
    if (current === id) await kv.delete(studentCurrentHomeworkKey(student));
  }

  return { id };
}

export async function loadPublishedCatalogEntries(kv: KVNamespace): Promise<Record<string, unknown>[]> {
  const ids = await readIndex(kv);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(catalogKey(id));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
  );
  return rows.filter((e): e is Record<string, unknown> => Boolean(e));
}

export async function loadPublishedAssignment(
  kv: KVNamespace,
  id: string
): Promise<Record<string, unknown> | null> {
  const raw = await kv.get(assignmentKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
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

async function resolveLatestLessonFromPlaylist(
  kv: KVNamespace | undefined,
  student: string,
  playlistUrl: string,
  bustCache = false,
  allowLiveFetch = true
): Promise<string | null> {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) return null;

  const cacheKey = playlistLatestCacheKey(student.toLowerCase(), playlistId);
  if (kv && !bustCache) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { url?: string };
        if (parsed.url) return parsed.url;
      } catch {
        /* refresh */
      }
    }
  }

  if (!allowLiveFetch) return null;

  const latest = await fetchLatestVideoFromPlaylist(playlistId);
  if (!latest) return null;

  if (kv) {
    await kv.put(
      cacheKey,
      JSON.stringify({ url: latest.url, videoId: latest.videoId, playlistId }),
      { expirationTtl: PLAYLIST_LATEST_TTL_SEC }
    );
  }
  return latest.url;
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

  return {
    ...profile,
    latestLessonUrl: fromPlaylist,
    youtubeUrl: fromPlaylist,
  };
}

export interface MergeCatalogOptions {
  /** Student hub: only enrich this learner — skips full roster + live playlist fetches. */
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

  const merged: CatalogFile = {
    ...staticCatalog,
    assignments,
  };

  if (!kv) return merged;

  const kvNs = kv;
  const allowLivePlaylist = !studentKey;

  if (studentKey) {
    const base = staticCatalog.studentProfiles?.[studentKey] || {};
    merged.studentProfiles = { [studentKey]: { ...base } };

    const media = await applyKvStudentMedia(kvNs, studentKey, base);
    if (media) merged.studentProfiles[studentKey] = media;

    const currentHomeworkId = await kvNs.get(studentCurrentHomeworkKey(studentKey));
    if (currentHomeworkId) {
      merged.studentProfiles[studentKey] = {
        ...(merged.studentProfiles[studentKey] || {}),
        currentHomeworkId,
      };
    }

    const profile = merged.studentProfiles[studentKey] || {};
    const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
    if (playlistUrl) {
      const manualYt = await getStudentYoutube(kvNs, studentKey);
      if (manualYt) {
        merged.studentProfiles[studentKey] = {
          ...profile,
          latestLessonUrl: manualYt,
          youtubeUrl: manualYt,
        };
      } else {
        const enriched = await enrichProfileWithPlaylistLatest(kvNs, studentKey, profile, {
          allowLiveFetch: allowLivePlaylist,
        });
        if (enriched.latestLessonUrl) {
          merged.studentProfiles[studentKey] = enriched;
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
      const currentHomeworkId = await kvNs.get(studentCurrentHomeworkKey(student));
      if (!currentHomeworkId) return;
      merged.studentProfiles![student] = {
        ...(merged.studentProfiles![student] || {}),
        currentHomeworkId,
      };
    })
  );

  await Promise.all(
    Object.entries(merged.studentProfiles || {}).map(async ([key, profile]) => {
      const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
      if (!playlistUrl) return;

      const manualYt = await getStudentYoutube(kvNs, key);
      if (manualYt) {
        merged.studentProfiles![key] = {
          ...profile,
          latestLessonUrl: manualYt,
          youtubeUrl: manualYt,
        };
        return;
      }

      const enriched = await enrichProfileWithPlaylistLatest(kvNs, key, profile, {
        allowLiveFetch: true,
      });
      if (enriched.latestLessonUrl) {
        merged.studentProfiles![key] = enriched;
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
  mediaKind?: "video" | "audio";
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
  photo?: HomeworkSubmissionPhoto;
  video?: HomeworkSubmissionVideo;
  submittedAt: string;
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

async function writeSubmission(kv: KVNamespace, submission: HomeworkSubmission): Promise<void> {
  await kv.put(submissionKey(submission.id), JSON.stringify(submission));
  const index = await readSubmissionsIndex(kv);
  if (!index.includes(submission.id)) {
    index.unshift(submission.id);
    await writeSubmissionsIndex(kv, index);
  }
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

  const section1 = Array.isArray(data.section1) ? data.section1 : [];
  const section2 = Array.isArray(data.section2) ? data.section2 : [];
  const listening = Array.isArray(data.listening) ? data.listening : [];
  const answers = Array.isArray(data.answers) ? data.answers : [];
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
    submittedAt: new Date().toISOString(),
  };

  await writeSubmission(kv, submission);
  return { id: submission.id };
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
  };

  await writeSubmission(kv, submission);
  return { id: submission.id, photoId: photo.id };
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
  };

  await writeSubmission(kv, submission);
  return { id: submission.id, videoId: video.id };
}

export async function listHomeworkSubmissions(
  env: KvEnv,
  opts?: { student?: string }
): Promise<HomeworkSubmission[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const filterStudent = String(opts?.student || "")
    .trim()
    .toLowerCase();
  const ids = await readSubmissionsIndex(kv);
  const submissions: HomeworkSubmission[] = [];

  for (const id of ids) {
    const raw = await kv.get(submissionKey(id));
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as HomeworkSubmission;
      if (filterStudent && entry.username !== filterStudent) continue;
      submissions.push(entry);
    } catch {
      /* skip corrupt */
    }
  }

  return submissions;
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
  data: { email: string; name?: string; page?: string },
  env: KvEnv
): Promise<{ id: string; duplicate: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const email = String(data.email || "").trim();
  const normalized = normalizePromoEmail(email);
  if (!normalized) throw new Error("EMAIL_REQUIRED");

  const name = String(data.name || "").trim();
  const existingId = await kv.get(promoEmailLookupKey(normalized));
  if (existingId) {
    if (name) {
      const raw = await kv.get(promoSignupKey(existingId));
      if (raw) {
        try {
          const record = JSON.parse(raw) as PromoSignup;
          const merged = [record.name, name].filter(Boolean).join("; ");
          if (merged && merged !== record.name) {
            record.name = merged;
            await kv.put(promoSignupKey(existingId), JSON.stringify(record));
          }
        } catch {
          /* ignore corrupt entry */
        }
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

  await kv.put(promoSignupKey(id), JSON.stringify(record));
  await kv.put(promoEmailLookupKey(normalized), id);

  const ids = await readPromoIndex(kv);
  ids.unshift(id);
  await writePromoIndex(kv, ids);

  return { id, duplicate: false };
}

export async function listPromoSignups(env: KvEnv): Promise<PromoSignup[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const ids = await readPromoIndex(kv);
  const signups: PromoSignup[] = [];

  for (const id of ids) {
    const raw = await kv.get(promoSignupKey(id));
    if (!raw) continue;
    try {
      signups.push(JSON.parse(raw) as PromoSignup);
    } catch {
      /* skip corrupt entry */
    }
  }

  return signups.sort(
    (a, b) => new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime()
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
