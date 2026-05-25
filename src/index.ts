interface Env {
  ASSETS: Fetcher;
  HW_UPLOADS?: R2Bucket;
  DISCORD_WEBHOOK_URL?: string;
  /** website-inquiries — used to verify the webhook posts to the right channel */
  DISCORD_CHANNEL_ID?: string;
  DISCORD_HOMEWORK_WEBHOOK_URL?: string;
  DISCORD_HOMEWORK_CHANNEL_ID?: string;
}

interface HomeworkAnswerRow {
  label?: string;
  prompt?: string;
  student?: string;
  expected?: string;
  correct?: boolean;
  /** Full sentence with the student's blank filled in */
  completed?: string;
}

interface HomeworkSubmitPayload {
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
}

interface HomeworkStoredSubmission {
  id: string;
  type: "typed" | "photo";
  submittedAt: string;
  username: string;
  displayName: string;
  assignmentId: string;
  lessonName?: string;
  title?: string;
  score?: string;
  summary: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileKey?: string;
  jsonKey: string;
  payload?: HomeworkSubmitPayload;
}

interface ContactPayload {
  name?: string;
  email?: string;
  service?: string;
  message?: string;
}

interface PromoPayload {
  email?: string;
  page?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function clip(value: string, max: number): string {
  const s = String(value ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function getWebhook(env: Env): string | null {
  return sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
}

function sanitizeWebhookUrl(raw: string | undefined): string | null {
  const url = raw?.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  return url || null;
}

function getHomeworkWebhook(env: Env): string | null {
  return sanitizeWebhookUrl(env.DISCORD_HOMEWORK_WEBHOOK_URL);
}

async function getWebhookChannelMismatch(
  webhookUrl: string,
  expectedChannelId: string | undefined,
  channelLabel: string
): Promise<string | null> {
  const expected = expectedChannelId?.trim();
  if (!expected) return null;

  const res = await fetch(webhookUrl);
  if (!res.ok) return "Could not verify Discord webhook configuration.";

  const wh = (await res.json()) as { channel_id?: string };
  if (wh.channel_id === expected) return null;

  return (
    `Discord webhook is not pointed at ${channelLabel} (expected channel ${expected}). ` +
    "Create or edit a webhook in that channel and update the matching wrangler secret."
  );
}

function fieldMaxLen(fieldName: string): number {
  if (fieldName === "Message" || fieldName.startsWith("Section ")) return 1024;
  return 256;
}

async function notifyDiscord(
  webhookUrl: string,
  payload: { title: string; color: number; fields: { name: string; value: string; inline?: boolean }[] }
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const body = {
    embeds: [
      {
        title: payload.title,
        color: payload.color,
        fields: payload.fields.map((f) => ({
          name: f.name,
          value: clip(f.value, fieldMaxLen(f.name)),
          inline: f.inline ?? false,
        })),
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) return { ok: true };

  const detail = await res.text();
  return { ok: false, status: res.status, detail: clip(detail, 200) };
}

function validateContact(data: ContactPayload): string | null {
  if (!data.name?.trim()) return "Name is required.";
  if (!data.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return "A valid email is required.";
  if (!data.service?.trim()) return "Service is required.";
  if (!data.message?.trim() || data.message.trim().length < 10)
    return "Message must be at least 10 characters.";
  return null;
}

function validatePromoEmail(data: PromoPayload): string | null {
  if (!data.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return "A valid email is required.";
  return null;
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let data: ContactPayload;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const error = validateContact(data);
  if (error) return jsonResponse({ error }, 400);

  const webhookUrl = getWebhook(env);
  if (!webhookUrl) {
    return jsonResponse(
      {
        error:
          "Contact notifications are not configured yet. Please try again later.",
      },
      503
    );
  }

  const channelError = await getWebhookChannelMismatch(
    webhookUrl,
    env.DISCORD_CHANNEL_ID,
    "#website-inquiries"
  );
  if (channelError) {
    console.error(channelError);
    return jsonResponse(
      {
        error:
          "Contact notifications are misconfigured. Please try again later or email us directly.",
      },
      503
    );
  }

  const result = await notifyDiscord(webhookUrl, {
    title: "Website inquiries — new message",
    color: 0xe74c3c,
    fields: [
      { name: "Name", value: data.name!.trim(), inline: true },
      { name: "Email", value: data.email!.trim(), inline: true },
      {
        name: "Service",
        value: data.service?.trim() || "General inquiry",
        inline: true,
      },
      { name: "Message", value: data.message!.trim() },
    ],
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Could not deliver your message. Please try again in a few minutes." },
      502
    );
  }

  return jsonResponse({
    success: true,
    message: "Thank you! I'll get back to you within 24 hours.",
  });
}

async function handlePromoSignup(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let data: PromoPayload;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const error = validatePromoEmail(data);
  if (error) return jsonResponse({ error }, 400);

  const webhookUrl = getWebhook(env);
  if (!webhookUrl) {
    return jsonResponse(
      { error: "Sign-ups are not configured yet. Please try again later." },
      503
    );
  }

  const channelError = await getWebhookChannelMismatch(
    webhookUrl,
    env.DISCORD_CHANNEL_ID,
    "#website-inquiries"
  );
  if (channelError) {
    console.error(channelError);
    return jsonResponse(
      { error: "Sign-ups are misconfigured. Please try again later." },
      503
    );
  }

  const page = data.page?.trim() || "Unknown page";
  const result = await notifyDiscord(webhookUrl, {
    title: "Website inquiries — promo email signup",
    color: 0x67c4eb,
    fields: [
      { name: "Email", value: data.email!.trim(), inline: true },
      { name: "Page", value: page, inline: true },
      {
        name: "Type",
        value: "Limited promotions & discounts list",
        inline: true,
      },
    ],
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Could not save your email. Please try again in a few minutes." },
      502
    );
  }

  return jsonResponse({
    success: true,
    message: "You're on the list! Watch your inbox for updates.",
  });
}

function formatSection1Discord(rows: HomeworkAnswerRow[] | undefined): string {
  if (!rows?.length) return "(none)";
  return rows
    .map((row) => {
      const label = row.label?.trim() || "—";
      const yours = row.student?.trim() || "(blank)";
      const expected = row.expected?.trim() || "—";
      const sentence = row.completed?.trim() || "";
      if (row.correct) {
        return `${label} ✓ Correct · Yours: ${yours}${sentence ? `\n   → ${sentence}` : ""}`;
      }
      return `${label} ✗ Expected: ${expected} · Yours: ${yours}${sentence ? `\n   → ${sentence}` : ""}`;
    })
    .join("\n");
}

function formatSection2Discord(rows: HomeworkAnswerRow[] | undefined): string {
  if (!rows?.length) return "(none)";
  return rows
    .map((row) => {
      const label = row.label?.trim() || "—";
      const sentence = row.completed?.trim() || row.student?.trim() || "(blank)";
      return `${label} ${sentence}`;
    })
    .join("\n");
}

function buildHomeworkDiscordDescription(
  data: HomeworkSubmitPayload,
  student: string,
  lesson: string,
  score: string
): string {
  const lines = [
    `Student: ${student}`,
    `Lesson: ${lesson}`,
    data.title?.trim() ? `Grammar: ${data.title.trim()}` : null,
    data.register?.trim() ? `Register: ${data.register.trim()}` : null,
    score !== "—" ? `Section 1 score: ${score}` : null,
    "",
    "Section 1",
    "",
    formatSection1Discord(data.section1),
    "",
    "Section 2 — completed sentences",
    "",
    formatSection2Discord(data.section2),
  ];
  return lines.filter((line) => line != null).join("\n");
}

function safeKeyPart(value: string | undefined, fallback: string): string {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return cleaned || fallback;
}

function submissionId(prefix: string): string {
  const rand = crypto.randomUUID().slice(0, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

function homeworkStorageRequired(env: Env): R2Bucket | null {
  return env.HW_UPLOADS || null;
}

function isUploadedFile(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "type" in value &&
    "size" in value
  );
}

async function saveHomeworkSubmission(
  env: Env,
  record: Omit<HomeworkStoredSubmission, "jsonKey">
): Promise<HomeworkStoredSubmission | null> {
  const bucket = homeworkStorageRequired(env);
  if (!bucket) return null;

  const jsonKey = `submissions/${record.submittedAt.slice(0, 10)}/${record.id}.json`;
  const stored: HomeworkStoredSubmission = { ...record, jsonKey };
  await bucket.put(jsonKey, JSON.stringify(stored, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return stored;
}

async function readStoredSubmission(
  bucket: R2Bucket,
  key: string
): Promise<HomeworkStoredSubmission | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  try {
    return (await obj.json()) as HomeworkStoredSubmission;
  } catch {
    return null;
  }
}

async function listHomeworkSubmissions(env: Env): Promise<HomeworkStoredSubmission[]> {
  const bucket = homeworkStorageRequired(env);
  if (!bucket) return [];

  const listed = await bucket.list({ prefix: "submissions/", limit: 100 });
  const records = await Promise.all(
    listed.objects.map((obj) => readStoredSubmission(bucket, obj.key))
  );
  return records
    .filter((record): record is HomeworkStoredSubmission => record !== null)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

async function postDiscordWebhook(
  webhookUrl: string,
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const detail = await res.text();
  return { ok: false, status: res.status, detail: clip(detail, 500) };
}

async function notifyHomeworkDiscord(
  webhookUrl: string,
  text: string
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const result = await postDiscordWebhook(webhookUrl, { content: clip(text, 2000) });
  if (result.ok) return result;
  return postDiscordWebhook(webhookUrl, {
    embeds: [
      {
        title: "Homework submitted",
        description: clip(text, 4096),
        color: 0xf1c40f,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

async function notifyHomeworkDiscordWithFile(
  webhookUrl: string,
  text: string,
  file: File
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: clip(text, 1800),
    })
  );
  form.append("files[0]", file, safeKeyPart(file.name, "homework-photo.jpg"));

  const res = await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });
  if (res.ok) return { ok: true };
  const detail = await res.text();
  return { ok: false, status: res.status, detail: clip(detail, 500) };
}

function validateHomeworkSubmit(data: HomeworkSubmitPayload): string | null {
  if (!data.username?.trim()) return "Username is required.";
  if (!data.assignmentId?.trim()) return "Assignment is required.";
  const s1 = data.section1?.length ?? 0;
  const s2 = data.section2?.length ?? 0;
  if (s1 + s2 === 0) return "No answers to submit.";
  return null;
}

async function handleHomeworkSubmit(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
  let data: HomeworkSubmitPayload;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const error = validateHomeworkSubmit(data);
  if (error) return jsonResponse({ error }, 400);

  const webhookUrl = getHomeworkWebhook(env);
  if (!webhookUrl) {
    return jsonResponse(
      {
        error:
          "Homework submit is not configured yet. Ask JD to set DISCORD_HOMEWORK_WEBHOOK_URL.",
      },
      503
    );
  }

  const channelError = await getWebhookChannelMismatch(
    webhookUrl,
    env.DISCORD_HOMEWORK_CHANNEL_ID,
    "homework submissions"
  );
  if (channelError) {
    console.error(channelError);
    return jsonResponse(
      { error: "Homework submit is misconfigured. Please try again later." },
      503
    );
  }

  const student = data.displayName?.trim() || data.username!.trim();
  const lesson = data.lessonName?.trim() || data.assignmentId!.trim();
  const score =
    data.scoreTotal != null && data.scoreTotal > 0
      ? `${data.scoreCorrect ?? 0}/${data.scoreTotal} Section 1`
      : "—";

  const bodyText = [
    `Homework submitted — ${student}`,
    "",
    buildHomeworkDiscordDescription(data, student, lesson, score),
  ].join("\n");

  const stored = await saveHomeworkSubmission(env, {
    id: submissionId("typed"),
    type: "typed",
    submittedAt: new Date().toISOString(),
    username: data.username!.trim(),
    displayName: student,
    assignmentId: data.assignmentId!.trim(),
    lessonName: data.lessonName?.trim(),
    title: data.title?.trim(),
    score,
    summary: `${lesson}${score !== "—" ? ` · ${score}` : ""}`,
    payload: data,
  });

  const result = await notifyHomeworkDiscord(
    webhookUrl,
    stored ? `${bodyText}\n\nStored: ${stored.jsonKey}` : bodyText
  );

  if (!result.ok) {
    console.error("Homework Discord error", result.status, result.detail);
    return jsonResponse(
      { error: "Could not send homework. Please try again in a few minutes." },
      502
    );
  }

  return jsonResponse({
    success: true,
    message: stored
      ? "Submitted! JD can see your answers in Discord and Teacher Hub."
      : "Submitted! JD can see your answers in Discord.",
  });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-submit failed:", detail);
    return jsonResponse({ error: "Homework submit failed. Please try again later." }, 500);
  }
}

async function handleHomeworkPhotoUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const displayName = String(form.get("displayName") || username).trim();
    const assignmentId = String(form.get("assignmentId") || "printed-homework").trim();
    const lessonName = String(form.get("lessonName") || assignmentId).trim();
    const file = form.get("photo");

    if (!username) return jsonResponse({ error: "Username is required." }, 400);
    if (!isUploadedFile(file)) return jsonResponse({ error: "Photo is required." }, 400);
    if (!file.type.startsWith("image/")) {
      return jsonResponse({ error: "Please upload an image file." }, 400);
    }
    if (file.size > 8 * 1024 * 1024) {
      return jsonResponse({ error: "Image must be under 8 MB." }, 400);
    }

    const bucket = homeworkStorageRequired(env);
    if (!bucket) {
      return jsonResponse(
        { error: "Homework upload storage is not configured yet." },
        503
      );
    }

    const id = submissionId("photo");
    const submittedAt = new Date().toISOString();
    const safeStudent = safeKeyPart(username, "student");
    const safeName = safeKeyPart(file.name, "homework-photo.jpg");
    const fileKey = `uploads/${safeStudent}/${submittedAt.slice(0, 10)}/${id}-${safeName}`;
    await bucket.put(fileKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        username,
        displayName,
        assignmentId,
        submittedAt,
      },
    });

    const stored = await saveHomeworkSubmission(env, {
      id,
      type: "photo",
      submittedAt,
      username,
      displayName,
      assignmentId,
      lessonName,
      summary: `Photo upload · ${lessonName}`,
      fileName: file.name || safeName,
      fileType: file.type,
      fileSize: file.size,
      fileKey,
    });

    const webhookUrl = getHomeworkWebhook(env);
    if (webhookUrl) {
      const text = [
        `Printed homework photo — ${displayName}`,
        "",
        `Student: ${displayName} (${username})`,
        `Assignment: ${lessonName}`,
        `File: ${file.name || safeName} (${Math.round(file.size / 1024)} KB)`,
        stored ? `Stored: ${stored.jsonKey}` : null,
        `R2 object: ${fileKey}`,
      ]
        .filter(Boolean)
        .join("\n");
      const result = await notifyHomeworkDiscordWithFile(webhookUrl, text, file);
      if (!result.ok) {
        console.error("Homework photo Discord error", result.status, result.detail);
      }
    }

    return jsonResponse({
      success: true,
      message: "Photo uploaded! JD can see it in Teacher Hub.",
      submission: stored,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-photo-upload failed:", detail);
    return jsonResponse({ error: "Photo upload failed. Please try again later." }, 500);
  }
}

async function handleHomeworkSubmissions(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (request.headers.get("X-HW-Role") !== "teacher") {
    return jsonResponse({ error: "Teacher access required." }, 403);
  }

  const submissions = await listHomeworkSubmissions(env);
  return jsonResponse({
    submissions: submissions.map((record) => ({
      id: record.id,
      type: record.type,
      submittedAt: record.submittedAt,
      username: record.username,
      displayName: record.displayName,
      assignmentId: record.assignmentId,
      lessonName: record.lessonName,
      title: record.title,
      score: record.score,
      summary: record.summary,
      fileName: record.fileName,
      fileType: record.fileType,
      fileSize: record.fileSize,
      fileKey: record.fileKey,
      jsonKey: record.jsonKey,
    })),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    if (url.pathname === "/api/promo-signup") {
      return handlePromoSignup(request, env);
    }

    if (url.pathname === "/api/homework-submit") {
      return handleHomeworkSubmit(request, env);
    }

    if (url.pathname === "/api/homework-photo-upload") {
      return handleHomeworkPhotoUpload(request, env);
    }

    if (url.pathname === "/api/homework-submissions") {
      return handleHomeworkSubmissions(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
