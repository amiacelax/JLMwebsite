/** Published homework in KV (teacher → student hub, no git deploy). */

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

export interface PublishPayload {
  teacherUsername?: string;
  studentUsername?: string;
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
  youtubeUrl?: string;
}

interface KvEnv {
  HOMEWORK_KV?: KVNamespace;
  HW_TEACHER_USER?: string;
}

const TEACHER_DEFAULT = "jlm";

/** Must match student accounts in public/js/hw-auth.js */
const STUDENT_ACCOUNTS = new Set(["benm", "joshs", "deme"]);

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
  catalogEntry.students = [student];
  assignment.id = id;

  const youtube = String(data.youtubeUrl || catalogEntry.youtubeUrl || assignment.youtubeUrl || "").trim();
  if (youtube) {
    catalogEntry.youtubeUrl = youtube;
    assignment.youtubeUrl = youtube;
    await kv.put(studentYoutubeKey(student), youtube);
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
    merged.studentProfiles = { ...(staticCatalog.studentProfiles || {}) };
    for (const [user, profile] of Object.entries(staticCatalog.studentProfiles || {})) {
      const key = user.toLowerCase();
      const yt = await getStudentYoutube(kv, key);
      if (yt) {
        merged.studentProfiles![key] = { ...profile, latestLessonUrl: yt, youtubeUrl: yt };
      }
    }
    for (const entry of published) {
      for (const user of (entry.students as string[]) || []) {
        const key = String(user).toLowerCase();
        const yt = await getStudentYoutube(kv, key);
        if (yt) {
          merged.studentProfiles![key] = {
            ...(merged.studentProfiles![key] || {}),
            latestLessonUrl: yt,
            youtubeUrl: yt,
          };
        }
      }
    }
  }

  return merged;
}
