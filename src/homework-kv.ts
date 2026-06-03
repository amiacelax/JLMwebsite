/** Published homework in KV (teacher → student hub, no git deploy). */

import { extractPlaylistId, fetchLatestVideoFromPlaylist } from "./youtube-playlist";

export interface CatalogFile {
  playlistUrl?: string;
  reviewPlaylistUrl?: string;
  studentProfiles?: Record<
    string,
    {
      latestLessonUrl?: string;
      youtubeUrl?: string;
      lessonPlaylistUrl?: string;
      reviewPlaylistUrl?: string;
    }
  >;
  assignments?: Record<string, unknown>[];
}

const KV_INDEX = "catalog-index";
const assignmentKey = (id: string) => `assignment:${id}`;
const catalogKey = (id: string) => `catalog:${id}`;
const studentYoutubeKey = (username: string) => `student:${username}:youtube`;
const studentLessonPlaylistKey = (username: string) => `student:${username}:lesson-playlist`;
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
}

export interface SaveWorksheetPayload {
  teacherUsername?: string;
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
}

interface KvEnv {
  HOMEWORK_KV?: KVNamespace;
  HW_TEACHER_USER?: string;
}

const TEACHER_DEFAULT = "jlm";

/** Must match student accounts in public/js/hw-auth.js */
const STUDENT_ACCOUNTS = new Set(["benm", "joshs", "deme", "ivan"]);

function isTeacher(username: string | undefined, env: KvEnv): boolean {
  const allowed = (env.HW_TEACHER_USER || TEACHER_DEFAULT).toLowerCase();
  return String(username || "")
    .trim()
    .toLowerCase() === allowed;
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
  if (!STUDENT_ACCOUNTS.has(student)) throw new Error("UNKNOWN_STUDENT");

  await applyStudentMedia(kv, student, {
    youtubeUrl: data.youtubeUrl,
    lessonPlaylistUrl: data.lessonPlaylistUrl,
  });

  const playlist = String(data.lessonPlaylistUrl || "").trim();
  if (playlist) {
    await resolveLatestLessonFromPlaylist(kv, student, playlist, true);
  }

  return { student };
}

export async function publishToStudentHub(
  data: PublishPayload,
  env: KvEnv
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
  if (!STUDENT_ACCOUNTS.has(student)) throw new Error("UNKNOWN_STUDENT");

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
  }
  catalogEntry.students = students;

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
  catalogEntry.students = [];
  assignment.id = id;
  assignment.status = assignment.status || "draft";

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

export async function loadPublishedCatalogEntries(kv: KVNamespace): Promise<Record<string, unknown>[]> {
  const ids = await readIndex(kv);
  const entries: Record<string, unknown>[] = [];
  for (const id of ids) {
    const raw = await kv.get(catalogKey(id));
    if (!raw) continue;
    try {
      entries.push(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      /* skip corrupt */
    }
  }
  return entries;
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
  bustCache = false
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
  profile: NonNullable<CatalogFile["studentProfiles"]>[string]
): Promise<NonNullable<CatalogFile["studentProfiles"]>[string]> {
  const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
  if (!playlistUrl) return profile;

  const fromPlaylist = await resolveLatestLessonFromPlaylist(kv, student, playlistUrl);
  if (!fromPlaylist) return profile;

  return {
    ...profile,
    latestLessonUrl: fromPlaylist,
    youtubeUrl: fromPlaylist,
  };
}

export async function mergeCatalog(
  staticCatalog: CatalogFile,
  kv: KVNamespace | undefined
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

  const merged: CatalogFile = {
    ...staticCatalog,
    assignments: [...byId.values()],
  };

  if (kv) {
    const kvNs = kv;
    type StudentProfile = NonNullable<CatalogFile["studentProfiles"]>[string];
    merged.studentProfiles = { ...(staticCatalog.studentProfiles || {}) };
    async function applyKvStudentMedia(key: string, base: StudentProfile) {
      const yt = await getStudentYoutube(kvNs, key);
      const playlist = await getStudentLessonPlaylist(kvNs, key);
      let next: StudentProfile = { ...base };
      if (playlist) {
        next = { ...next, lessonPlaylistUrl: playlist };
      }
      if (yt) {
        next = { ...next, latestLessonUrl: yt, youtubeUrl: yt };
      }
      if (yt || playlist || base.lessonPlaylistUrl) {
        merged.studentProfiles![key] = next;
      }
    }

    for (const [user, profile] of Object.entries(staticCatalog.studentProfiles || {})) {
      const key = user.toLowerCase();
      await applyKvStudentMedia(key, profile);
    }
    for (const entry of published) {
      for (const user of (entry.students as string[]) || []) {
        const key = String(user).toLowerCase();
        await applyKvStudentMedia(key, merged.studentProfiles![key] || {});
      }
    }

    for (const [key, profile] of Object.entries(merged.studentProfiles || {})) {
      const playlistUrl = String(profile.lessonPlaylistUrl || "").trim();
      if (!playlistUrl) continue;

      const manualYt = await getStudentYoutube(kvNs, key);
      if (manualYt) {
        merged.studentProfiles![key] = {
          ...profile,
          latestLessonUrl: manualYt,
          youtubeUrl: manualYt,
        };
        continue;
      }

      const enriched = await enrichProfileWithPlaylistLatest(kvNs, key, profile);
      if (enriched.latestLessonUrl) {
        merged.studentProfiles![key] = enriched;
      }
    }
  }

  return merged;
}
