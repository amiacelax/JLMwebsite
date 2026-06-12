import { runBirthdayReminders } from "./birthday-reminders";
import {
  isHarrisPreviewAuthorized,
  isHarrisPreviewPath,
  harrisPreviewUnauthorized,
  withHarrisPreviewHeaders,
} from "./harris-preview-auth";
import {
  daysUntilBirthday,
  formatBirthdayLabel,
  listStudentBirthdaysSorted,
} from "./student-birthdays";
import {
  generateHomeworkWithAi,
  type HomeworkGenerateRequest,
} from "./homework-generate";
import {
  mergeCatalog,
  publishToStudentHub,
  saveStudentProfile,
  saveWorksheetDraft,
  loadPublishedAssignment,
  listTeacherIdeas,
  listTeacherIdeaTags,
  saveTeacherIdea,
  deleteTeacherIdea,
  addTeacherIdeaTag,
  deleteTeacherIdeaTag,
  deleteTeacherIdeaImage,
  listCustomTeacherIdeaTags,
  uploadTeacherIdeaImage,
  loadTeacherIdeaImage,
  type CatalogFile,
  type PublishPayload,
  type StudentProfilePayload,
  type SaveWorksheetPayload,
  type TeacherIdeaPayload,
  type TeacherIdeaDeletePayload,
  type TeacherIdeaTagPayload,
  type TeacherIdeaImageDeletePayload,
  saveHomeworkOnlineSubmission,
  saveHomeworkPhotoSubmission,
  saveHomeworkVideoSubmission,
  listHomeworkSubmissions,
  getHomeworkSubmission,
  loadHomeworkSubmissionPhoto,
  loadHomeworkSubmissionVideo,
  savePromoSignup,
  listPromoSignups,
  savePromoSignupTeacher,
  deletePromoSignup,
  type PromoSignupSavePayload,
  type PromoSignupDeletePayload,
  type HomeworkOnlineSubmitInput,
  type HomeworkPhotoSubmitInput,
  type HomeworkVideoSubmitInput,
} from "./homework-kv";
import {
  createUserAccount,
  deleteUserAccount,
  loginUserAccount,
  type SignupInput,
  type LoginInput,
} from "./user-accounts";

interface Env {
  ASSETS: Fetcher;
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  /** website-inquiries — used to verify the webhook posts to the right channel */
  DISCORD_CHANNEL_ID?: string;
  DISCORD_HOMEWORK_WEBHOOK_URL?: string;
  DISCORD_HOMEWORK_CHANNEL_ID?: string;
  OPENAI_API_KEY?: string;
  HW_TEACHER_USER?: string;
  HARRIS_PREVIEW_USER?: string;
  HARRIS_PREVIEW_PASSWORD?: string;
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
  if (raw == null || raw === "") return null;
  let url = String(raw).trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) {
    console.error("Invalid Discord webhook URL (must be https://discord.com/api/webhooks/...)");
    return null;
  }
  return url;
}

type ResolvedHomeworkWebhook = {
  url: string;
  channelId?: string;
  /** True when homework webhook secret is missing and site webhook is used */
  usedFallback: boolean;
};

function resolveHomeworkWebhook(env: Env): ResolvedHomeworkWebhook | null {
  const homeworkUrl = sanitizeWebhookUrl(env.DISCORD_HOMEWORK_WEBHOOK_URL);
  if (homeworkUrl) {
    return {
      url: homeworkUrl,
      channelId: env.DISCORD_HOMEWORK_CHANNEL_ID,
      usedFallback: false,
    };
  }
  const siteUrl = sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
  if (siteUrl) {
    return {
      url: siteUrl,
      channelId: env.DISCORD_CHANNEL_ID,
      usedFallback: true,
    };
  }
  return null;
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
  const email = data.email!.trim();

  let kvSaved = false;
  let duplicate = false;
  try {
    const saved = await savePromoSignup({ email, page }, env);
    kvSaved = true;
    duplicate = saved.duplicate;
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code !== "KV_NOT_CONFIGURED") {
      console.error("promo-signup KV save failed:", err);
    }
  }

  const result = await notifyDiscord(webhookUrl, {
    title: duplicate
      ? "Website inquiries — promo email signup (duplicate)"
      : "Website inquiries — promo email signup",
    color: 0x67c4eb,
    fields: [
      { name: "Email", value: email, inline: true },
      { name: "Page", value: page, inline: true },
      {
        name: "Type",
        value: "Limited promotions & discounts list",
        inline: true,
      },
      ...(kvSaved
        ? [{ name: "Stored in hub", value: duplicate ? "Already on list" : "Yes", inline: true }]
        : []),
    ],
  });

  if (!kvSaved && !result.ok) {
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

async function handlePromoSignups(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
    if (teacherUsername.trim().toLowerCase() !== allowed) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }

    try {
      const signups = await listPromoSignups(env);
      return jsonResponse({ signups });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Email list storage is not configured on this server." }, 503);
      }
      console.error("promo-signups list failed:", err);
      return jsonResponse({ error: "Could not load email list." }, 500);
    }
  }

  if (request.method === "POST") {
    try {
      const data = (await request.json()) as PromoSignupSavePayload;
      const result = await savePromoSignupTeacher(data, env);
      return jsonResponse({
        success: true,
        message: result.updated ? "Contact updated." : "Contact added.",
        id: result.id,
        updated: result.updated,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Email list storage is not configured on this server." }, 503);
      }
      if (code === "TEACHER_ONLY") {
        return jsonResponse({ error: "Teacher login required." }, 403);
      }
      if (code === "EMAIL_REQUIRED") {
        return jsonResponse({ error: "Email or contact info is required." }, 400);
      }
      if (code === "EMAIL_IN_USE") {
        return jsonResponse({ error: "That email is already on the list." }, 409);
      }
      if (code === "NOT_FOUND") {
        return jsonResponse({ error: "Contact not found." }, 404);
      }
      console.error("promo-signups save failed:", err);
      return jsonResponse({ error: "Could not save contact." }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function handleAuthSignup(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as SignupInput;
    const result = await createUserAccount(data, env);
    return jsonResponse({
      success: true,
      message: "Account created.",
      session: result.session,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "USERNAME_REQUIRED") {
      return jsonResponse({ error: "Username is required." }, 400);
    }
    if (code === "USERNAME_INVALID") {
      return jsonResponse(
        { error: "Username must be 3–24 characters: letters, numbers, _ or -." },
        400
      );
    }
    if (code === "USERNAME_RESERVED") {
      return jsonResponse({ error: "That username is reserved." }, 409);
    }
    if (code === "EMAIL_INVALID") {
      return jsonResponse({ error: "A valid email is required." }, 400);
    }
    if (code === "PASSWORD_REQUIRED") {
      return jsonResponse({ error: "Password is required." }, 400);
    }
    if (code === "USERNAME_TAKEN" || code === "EMAIL_TAKEN") {
      return jsonResponse({ error: "Username or email is already in use." }, 409);
    }
    console.error("auth signup failed:", err);
    return jsonResponse({ error: "Could not create account." }, 500);
  }
}

async function handleAuthDeleteAccount(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Unauthorized." }, 403);
  }

  try {
    const data = (await request.json()) as { username?: string };
    const result = await deleteUserAccount(String(data.username || ""), env);
    return jsonResponse({
      success: true,
      username: result.username,
      deleted: result.deleted,
      message: result.deleted ? "Account deleted." : "Account not found.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "USERNAME_REQUIRED") {
      return jsonResponse({ error: "Username is required." }, 400);
    }
    console.error("auth delete failed:", err);
    return jsonResponse({ error: "Could not delete account." }, 500);
  }
}

async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as LoginInput;
    const result = await loginUserAccount(data, env);
    return jsonResponse({
      success: true,
      message: "Logged in.",
      session: result.session,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "INVALID_CREDENTIALS") {
      return jsonResponse({ error: "Invalid username or password." }, 401);
    }
    console.error("auth login failed:", err);
    return jsonResponse({ error: "Could not log in." }, 500);
  }
}

async function handlePromoSignupDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as PromoSignupDeletePayload;
    const result = await deletePromoSignup(data, env);
    return jsonResponse({
      success: true,
      message: "Contact removed.",
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Email list storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED") {
      return jsonResponse({ error: "Contact id is required." }, 400);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Contact not found." }, 404);
    }
    console.error("promo-signups delete failed:", err);
    return jsonResponse({ error: "Could not delete contact." }, 500);
  }
}

function formatSection1Discord(rows: HomeworkAnswerRow[] | undefined): string {
  if (!rows?.length) return "(none)";
  return rows
    .map((row) => {
      const label = row.label?.trim() || "—";
      const yours = row.student?.trim() || "(blank)";
      const sentence = row.completed?.trim() || "";
      return `${label} ${yours}${sentence ? `\n   → ${sentence}` : ""}`;
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
  lesson: string
): string {
  const lines = [
    `Student: ${student}`,
    `Lesson: ${lesson}`,
    data.title?.trim() ? `Grammar: ${data.title.trim()}` : null,
    data.register?.trim() ? `Register: ${data.register.trim()}` : null,
    "",
    "Section 1",
    "",
    formatSection1Discord(data.section1),
    "",
    "Section 2 — your response",
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

  let stored = false;
  try {
    await saveHomeworkOnlineSubmission(data as HomeworkOnlineSubmitInput, env);
    stored = true;
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 400);
    }
    if (code !== "KV_NOT_CONFIGURED") {
      console.error("homework-submit store failed:", err);
    }
  }

  const webhook = resolveHomeworkWebhook(env);
  let discordOk = false;
  if (webhook) {
    if (webhook.usedFallback) {
      console.warn(
        "homework-submit: DISCORD_HOMEWORK_WEBHOOK_URL missing — using DISCORD_WEBHOOK_URL (#website-inquiries)"
      );
    }

    const channelError = await getWebhookChannelMismatch(
      webhook.url,
      webhook.channelId,
      webhook.usedFallback ? "website-inquiries (homework fallback)" : "homework submissions"
    );
    if (channelError) {
      console.warn("homework-submit channel check:", channelError);
    }

    const student = data.displayName?.trim() || data.username!.trim();
    const lesson = data.lessonName?.trim() || data.assignmentId!.trim();
    const bodyText = [
      webhook.usedFallback ? "[Homework — posted via site webhook until HW webhook is set]" : null,
      `Homework submitted — ${student} (${data.username!.trim()})`,
      "",
      buildHomeworkDiscordDescription(data, student, lesson),
    ]
      .filter((line) => line != null)
      .join("\n");

    const result = await notifyHomeworkDiscord(webhook.url, bodyText);
    discordOk = result.ok;
    if (!result.ok) {
      console.error("Homework Discord error", result.status, result.detail);
    }
  } else {
    console.error("homework-submit: no Discord webhook configured");
  }

  if (stored) {
    return jsonResponse({
      success: true,
      message: discordOk
        ? "Submitted! JD can see your answers in Discord and on the teacher hub."
        : "Submitted! Your answers were saved on the teacher hub.",
    });
  }

  if (!webhook) {
    return jsonResponse(
      {
        error:
          "Homework submit is not set up on the server yet. Your answers are still saved in this browser — ask JD to enable homework storage.",
      },
      503
    );
  }

  if (!discordOk) {
    return jsonResponse(
      { error: "Could not send homework. Please try again in a few minutes." },
      502
    );
  }

  return jsonResponse({
    success: true,
    message: "Submitted! JD can see your answers in Discord.",
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

    const photoMeta: HomeworkPhotoSubmitInput = {
      username,
      displayName,
      assignmentId,
      lessonName,
    };

    let stored = false;
    try {
      await saveHomeworkPhotoSubmission(photoMeta, file, env);
      stored = true;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 400);
      }
      if (code === "IMAGE_TYPE") {
        return jsonResponse({ error: "Please upload an image file." }, 400);
      }
      if (code === "IMAGE_TOO_LARGE") {
        return jsonResponse({ error: "Image must be under 8 MB." }, 400);
      }
      if (code !== "KV_NOT_CONFIGURED") {
        console.error("homework-photo store failed:", err);
      }
    }

    const webhook = resolveHomeworkWebhook(env);
    let discordOk = false;
    if (webhook) {
      const safeName = safeKeyPart(file.name, "homework-photo.jpg");
      const channelError = await getWebhookChannelMismatch(
        webhook.url,
        webhook.channelId,
        webhook.usedFallback ? "website-inquiries (homework fallback)" : "homework submissions"
      );
      if (channelError) {
        console.warn("homework-photo channel check:", channelError);
      }

      const text = [
        webhook.usedFallback
          ? "[Homework photo — posted via site webhook until HW webhook is set]"
          : null,
        `Printed homework photo — ${displayName}`,
        "",
        `Student: ${displayName} (${username})`,
        `Assignment: ${lessonName}`,
        `File: ${file.name || safeName} (${Math.round(file.size / 1024)} KB)`,
      ]
        .filter((line) => line != null)
        .join("\n");
      const result = await notifyHomeworkDiscordWithFile(webhook.url, text, file);
      discordOk = result.ok;
      if (!result.ok) {
        console.error("Homework photo Discord error", result.status, result.detail);
      }
    } else {
      console.error("homework-photo: no Discord webhook configured");
    }

    if (stored) {
      return jsonResponse({
        success: true,
        message: discordOk
          ? "Homework sent! JD can see it in Discord now."
          : "Homework sent! JD can see it on the teacher hub.",
      });
    }

    if (!webhook) {
      return jsonResponse(
        {
          error:
            "Photo upload is not set up on the server yet. Ask JD to enable homework storage.",
        },
        503
      );
    }

    if (!discordOk) {
      return jsonResponse(
        { error: "Could not send photo. Please try again in a few minutes." },
        502
      );
    }

    return jsonResponse({
      success: true,
      message: "Homework sent! JD can see it in Discord now.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-photo-upload failed:", detail);
    return jsonResponse({ error: "Photo upload failed. Please try again later." }, 500);
  }
}

async function handleHomeworkVideoUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const displayName = String(form.get("displayName") || username).trim();
    const assignmentId = String(form.get("assignmentId") || "video-homework").trim();
    const lessonName = String(form.get("lessonName") || assignmentId).trim();
    const promptLabel = String(form.get("promptLabel") || "").trim();
    const file = form.get("video");

    if (!username) return jsonResponse({ error: "Username is required." }, 400);
    if (!isUploadedFile(file)) return jsonResponse({ error: "Video is required." }, 400);
    if (!file.type.startsWith("video/")) {
      return jsonResponse({ error: "Please upload a video file." }, 400);
    }
    if (file.size > 24 * 1024 * 1024) {
      return jsonResponse({ error: "Video must be under 24 MB." }, 400);
    }

    const videoMeta: HomeworkVideoSubmitInput = {
      username,
      displayName,
      assignmentId,
      lessonName,
    };

    let stored = false;
    try {
      await saveHomeworkVideoSubmission(videoMeta, file, env);
      stored = true;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 400);
      }
      if (code === "VIDEO_TYPE") {
        return jsonResponse({ error: "Please upload a video file." }, 400);
      }
      if (code === "VIDEO_TOO_LARGE") {
        return jsonResponse({ error: "Video must be under 24 MB." }, 400);
      }
      if (code !== "KV_NOT_CONFIGURED") {
        console.error("homework-video store failed:", err);
      }
    }

    const webhook = resolveHomeworkWebhook(env);
    let discordOk = false;
    if (webhook) {
      const safeName = safeKeyPart(file.name, "homework-video.webm");
      const channelError = await getWebhookChannelMismatch(
        webhook.url,
        webhook.channelId,
        webhook.usedFallback ? "website-inquiries (homework fallback)" : "homework submissions"
      );
      if (channelError) {
        console.warn("homework-video channel check:", channelError);
      }

      const text = [
        webhook.usedFallback
          ? "[Homework video — posted via site webhook until HW webhook is set]"
          : null,
        `Video homework — ${displayName}`,
        "",
        `Student: ${displayName} (${username})`,
        `Assignment: ${lessonName}`,
        promptLabel ? `Prompt: ${promptLabel}` : null,
        `File: ${file.name || safeName} (${Math.round(file.size / 1024)} KB)`,
      ]
        .filter((line) => line != null)
        .join("\n");
      const result = await notifyHomeworkDiscordWithFile(webhook.url, text, file);
      discordOk = result.ok;
      if (!result.ok) {
        console.error("Homework video Discord error", result.status, result.detail);
      }
    } else {
      console.error("homework-video: no Discord webhook configured");
    }

    if (stored) {
      return jsonResponse({
        success: true,
        message: discordOk
          ? "Homework sent! JD can see it in Discord now."
          : "Homework sent! JD can see it on the teacher hub.",
      });
    }

    if (!webhook) {
      return jsonResponse(
        {
          error:
            "Video upload is not set up on the server yet. Ask JD to enable homework storage.",
        },
        503
      );
    }

    if (!discordOk) {
      return jsonResponse(
        { error: "Could not send video. Please try again in a few minutes." },
        502
      );
    }

    return jsonResponse({
      success: true,
      message: "Homework sent! JD can see it in Discord now.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-video-upload failed:", detail);
    return jsonResponse({ error: "Video upload failed. Please try again later." }, 500);
  }
}

async function loadStaticCatalog(env: Env): Promise<CatalogFile> {
  const res = await env.ASSETS.fetch(
    new Request(new URL("/homework/catalog.json", "https://internal.local"))
  );
  if (!res.ok) return { assignments: [] };
  return (await res.json()) as CatalogFile;
}

async function handleHomeworkCatalog(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const staticCatalog = await loadStaticCatalog(env);
    const merged = await mergeCatalog(staticCatalog, env.HOMEWORK_KV);
    return jsonResponse(merged);
  } catch (err) {
    console.error("homework-catalog failed:", err);
    return jsonResponse({ error: "Could not load homework catalog." }, 500);
  }
}

async function handleHomeworkAssignment(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id || !/^[a-z0-9-]+$/i.test(id)) {
    return jsonResponse({ error: "Invalid assignment id." }, 400);
  }

  try {
    if (env.HOMEWORK_KV) {
      const published = await loadPublishedAssignment(env.HOMEWORK_KV, id);
      if (published) return jsonResponse(published);
    }
    const assetRes = await env.ASSETS.fetch(
      new Request(new URL(`/homework/assignments/${id}.json`, "https://internal.local"))
    );
    if (assetRes.ok) {
      return new Response(assetRes.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    }
    return jsonResponse({ error: "Assignment not found." }, 404);
  } catch (err) {
    console.error("homework-assignment failed:", err);
    return jsonResponse({ error: "Could not load assignment." }, 500);
  }
}

async function handleHomeworkPublish(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as PublishPayload;
    const sheetId = String(data.assignment?.id || data.catalogEntry?.id || "").trim();
    const staticCatalog = await loadStaticCatalog(env);
    const staticEntry = (staticCatalog.assignments || []).find((e) => String(e.id) === sheetId);
    const staticStudents = ((staticEntry as { students?: string[] } | undefined)?.students || [])
      .map((s) => String(s).toLowerCase())
      .filter(Boolean);
    const result = await publishToStudentHub(data, env, { staticStudents });
    const origin = new URL(request.url).origin;
    return jsonResponse({
      success: true,
      message: result.updated
        ? `Updated homework for ${data.studentUsername}. They can refresh their Homework Hub to see your edits.`
        : `Published for ${data.studentUsername}. They can open it on their Homework Hub now.`,
      id: result.id,
      studentUrl: origin + result.studentUrl,
      updated: result.updated,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED" || code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Student id and worksheet id are required." }, 400);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse(
        { error: "Unknown student id. Add the account in hw-auth.js first." },
        400
      );
    }
    console.error("homework-publish failed:", err);
    return jsonResponse({ error: "Could not publish homework." }, 500);
  }
}

async function handleHomeworkSaveWorksheet(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as SaveWorksheetPayload;
    const result = await saveWorksheetDraft(data, env);
    return jsonResponse({
      success: true,
      message: result.updated
        ? `Updated worksheet “${result.id}” in the library.`
        : `Saved worksheet “${result.id}” to the library.`,
      id: result.id,
      updated: result.updated,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED") {
      return jsonResponse({ error: "Worksheet id is required." }, 400);
    }
    console.error("homework-save-worksheet failed:", err);
    return jsonResponse({ error: "Could not save worksheet." }, 500);
  }
}

async function handleHomeworkStudentProfile(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as StudentProfilePayload;
    const result = await saveStudentProfile(data, env);
    return jsonResponse({
      success: true,
      message: `Saved links for ${result.student}. They can refresh their Homework Hub to see updates.`,
      student: result.student,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Student id is required." }, 400);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse(
        { error: "Unknown student id. Add the account in hw-auth.js first." },
        400
      );
    }
    console.error("homework-student-profile failed:", err);
    return jsonResponse({ error: "Could not save student info." }, 500);
  }
}

async function handleHomeworkGenerate(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as HomeworkGenerateRequest;
    const result = await generateHomeworkWithAi(data, env);
    return jsonResponse({ success: true, ...result });
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "GRAMMAR_REQUIRED" || code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Grammar point and student id are required." }, 400);
    }
    if (code === "AI_FAILED" || code === "AI_EMPTY" || code === "AI_INVALID") {
      return jsonResponse(
        { error: "AI could not build homework. Try again or edit manually." },
        502
      );
    }
    console.error("homework-generate failed:", err);
    return jsonResponse({ error: "Homework generation failed." }, 500);
  }
}

async function handleTeacherIdeas(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
    if (teacherUsername.trim().toLowerCase() !== allowed) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    try {
      const [ideas, tags, customTags] = await Promise.all([
        listTeacherIdeas(env),
        listTeacherIdeaTags(env),
        listCustomTeacherIdeaTags(env),
      ]);
      return jsonResponse({ ideas, tags, customTags });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
      }
      console.error("teacher-ideas list failed:", err);
      return jsonResponse({ error: "Could not load ideas." }, 500);
    }
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaPayload;
    const result = await saveTeacherIdea(data, env);
    return jsonResponse({
      success: true,
      message: result.updated ? "Idea updated." : "Idea saved.",
      id: result.id,
      updated: result.updated,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "TEXT_REQUIRED" || code === "CONTENT_REQUIRED") {
      return jsonResponse({ error: "Add some text or at least one image before saving." }, 400);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Idea not found." }, 404);
    }
    console.error("teacher-ideas save failed:", err);
    return jsonResponse({ error: "Could not save idea." }, 500);
  }
}

async function handleTeacherIdeaTag(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaTagPayload;
    const result = await addTeacherIdeaTag(data, env);
    return jsonResponse({
      success: true,
      message: `Tag “${result.tag}” added.`,
      tag: result.tag,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "TAG_INVALID") {
      return jsonResponse({ error: "Use letters, numbers, or hyphens (max 24 chars)." }, 400);
    }
    console.error("teacher-ideas tag failed:", err);
    return jsonResponse({ error: "Could not add tag." }, 500);
  }
}

async function handleTeacherIdeaImageUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const form = await request.formData();
    const teacherUsername = String(form.get("teacherUsername") || "").trim();
    const file = form.get("image");
    if (!isUploadedFile(file)) {
      return jsonResponse({ error: "Image file is required." }, 400);
    }

    const result = await uploadTeacherIdeaImage(teacherUsername, file, env);
    const origin = new URL(request.url).origin;
    const url =
      origin +
      "/api/teacher-ideas/image?id=" +
      encodeURIComponent(result.id) +
      "&teacherUsername=" +
      encodeURIComponent(teacherUsername);
    return jsonResponse({
      success: true,
      message: "Image uploaded.",
      ...result,
      url,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "IMAGE_TYPE") {
      return jsonResponse({ error: "Use a JPEG, PNG, GIF, or WebP image." }, 400);
    }
    if (code === "IMAGE_TOO_LARGE") {
      return jsonResponse({ error: "Image must be under 4 MB." }, 400);
    }
    console.error("teacher-ideas image upload failed:", err);
    return jsonResponse({ error: "Could not upload image." }, 500);
  }
}

async function handleTeacherIdeaImage(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = url.searchParams.get("id") || "";
    const loaded = await loadTeacherIdeaImage(teacherUsername, id, env);
    if (!loaded) return jsonResponse({ error: "Image not found." }, 404);

    return new Response(loaded.body, {
      status: 200,
      headers: {
        "Content-Type": loaded.mimeType,
        "Cache-Control": "private, max-age=3600",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    console.error("teacher-ideas image load failed:", err);
    return jsonResponse({ error: "Could not load image." }, 500);
  }
}

async function handleTeacherIdeaImageDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaImageDeletePayload;
    const result = await deleteTeacherIdeaImage(data, env);
    return jsonResponse({
      success: true,
      message: "Image deleted.",
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED" || code === "NOT_FOUND") {
      return jsonResponse({ error: "Image not found." }, 404);
    }
    console.error("teacher-ideas image delete failed:", err);
    return jsonResponse({ error: "Could not delete image." }, 500);
  }
}

async function handleTeacherIdeaTagDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaTagPayload;
    const result = await deleteTeacherIdeaTag(data, env);
    return jsonResponse({
      success: true,
      message: `Tag “${result.tag}” deleted.`,
      tag: result.tag,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "TAG_INVALID" || code === "NOT_FOUND") {
      return jsonResponse({ error: "Tag not found." }, 404);
    }
    if (code === "TAG_DEFAULT") {
      return jsonResponse({ error: "Built-in tags cannot be deleted." }, 400);
    }
    console.error("teacher-ideas tag delete failed:", err);
    return jsonResponse({ error: "Could not delete tag." }, 500);
  }
}

async function handleTeacherIdeaDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaDeletePayload;
    const result = await deleteTeacherIdea(data, env);
    return jsonResponse({
      success: true,
      message: "Idea deleted.",
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED") {
      return jsonResponse({ error: "Idea id is required." }, 400);
    }
    console.error("teacher-ideas delete failed:", err);
    return jsonResponse({ error: "Could not delete idea." }, 500);
  }
}

async function handleHomeworkSubmissions(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  try {
    const id = url.searchParams.get("id") || "";
    if (id) {
      const submission = await getHomeworkSubmission(env, id);
      if (!submission) return jsonResponse({ error: "Submission not found." }, 404);
      return jsonResponse({ submission });
    }

    const student = url.searchParams.get("student") || "";
    const submissions = await listHomeworkSubmissions(env, { student });
    return jsonResponse({ submissions });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    console.error("homework-submissions list failed:", err);
    return jsonResponse({ error: "Could not load submissions." }, 500);
  }
}

async function handleStudentBirthdays(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  const birthdays = listStudentBirthdaysSorted().map((entry) => ({
    id: entry.id,
    name: entry.name,
    month: entry.month,
    day: entry.day,
    uncertain: !!entry.uncertain,
    note: entry.note || null,
    label: formatBirthdayLabel(entry),
    daysUntil: daysUntilBirthday(entry),
  }));

  return jsonResponse({ birthdays });
}

async function handleHomeworkSubmissionVideo(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = url.searchParams.get("id") || "";
    const loaded = await loadHomeworkSubmissionVideo(teacherUsername, id, env);
    if (!loaded) return jsonResponse({ error: "Video not found." }, 404);

    return new Response(loaded.body, {
      status: 200,
      headers: {
        "Content-Type": loaded.mimeType,
        "Cache-Control": "private, max-age=3600",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    console.error("homework-submission video failed:", err);
    return jsonResponse({ error: "Could not load video." }, 500);
  }
}

async function handleHomeworkSubmissionPhoto(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = url.searchParams.get("id") || "";
    const loaded = await loadHomeworkSubmissionPhoto(teacherUsername, id, env);
    if (!loaded) return jsonResponse({ error: "Photo not found." }, 404);

    return new Response(loaded.body, {
      status: 200,
      headers: {
        "Content-Type": loaded.mimeType,
        "Cache-Control": "private, max-age=3600",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    console.error("homework-submission photo failed:", err);
    return jsonResponse({ error: "Could not load photo." }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    if (url.pathname === "/api/auth/signup") {
      return handleAuthSignup(request, env);
    }

    if (url.pathname === "/api/auth/login") {
      return handleAuthLogin(request, env);
    }

    if (url.pathname === "/api/auth/delete-account") {
      return handleAuthDeleteAccount(request, env);
    }

    if (url.pathname === "/api/promo-signup") {
      return handlePromoSignup(request, env);
    }

    if (url.pathname === "/api/promo-signups") {
      return handlePromoSignups(request, env);
    }

    if (url.pathname === "/api/promo-signups/delete") {
      return handlePromoSignupDelete(request, env);
    }

    if (url.pathname === "/api/student-birthdays") {
      return handleStudentBirthdays(request, env);
    }

    if (url.pathname === "/api/homework-submit") {
      return handleHomeworkSubmit(request, env);
    }

    if (url.pathname === "/api/homework-submissions") {
      return handleHomeworkSubmissions(request, env);
    }

    if (url.pathname === "/api/homework-submissions/photo") {
      return handleHomeworkSubmissionPhoto(request, env);
    }

    if (url.pathname === "/api/homework-submissions/video") {
      return handleHomeworkSubmissionVideo(request, env);
    }

    if (url.pathname === "/api/homework-photo-upload") {
      return handleHomeworkPhotoUpload(request, env);
    }

    if (url.pathname === "/api/homework-video-upload") {
      return handleHomeworkVideoUpload(request, env);
    }

    if (url.pathname === "/api/homework-generate") {
      return handleHomeworkGenerate(request, env);
    }

    if (url.pathname === "/api/homework-catalog") {
      return handleHomeworkCatalog(request, env);
    }

    if (url.pathname === "/api/homework-assignment") {
      return handleHomeworkAssignment(request, env);
    }

    if (url.pathname === "/api/homework-publish") {
      return handleHomeworkPublish(request, env);
    }

    if (url.pathname === "/api/homework-student-profile") {
      return handleHomeworkStudentProfile(request, env);
    }

    if (url.pathname === "/api/homework-save-worksheet") {
      return handleHomeworkSaveWorksheet(request, env);
    }

    if (url.pathname === "/api/teacher-ideas") {
      return handleTeacherIdeas(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/tags") {
      return handleTeacherIdeaTag(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/tags/delete") {
      return handleTeacherIdeaTagDelete(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/upload-image") {
      return handleTeacherIdeaImageUpload(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/image") {
      return handleTeacherIdeaImage(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/images/delete") {
      return handleTeacherIdeaImageDelete(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/delete") {
      return handleTeacherIdeaDelete(request, env);
    }

    if (isHarrisPreviewPath(url.pathname)) {
      if (!isHarrisPreviewAuthorized(request, env)) {
        return harrisPreviewUnauthorized();
      }
      const assetResponse = await env.ASSETS.fetch(request);
      return withHarrisPreviewHeaders(assetResponse);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runBirthdayReminders(env));
  },
};
