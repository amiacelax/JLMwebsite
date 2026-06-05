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
