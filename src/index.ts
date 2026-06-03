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
  type CatalogFile,
  type PublishPayload,
  type StudentProfilePayload,
  type SaveWorksheetPayload,
} from "./homework-kv";

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

  const webhook = resolveHomeworkWebhook(env);
  if (!webhook) {
    console.error("homework-submit: no Discord webhook configured");
    return jsonResponse(
      {
        error:
          "Homework submit is not set up on the server yet. Your answers are still saved in this browser — ask JD to enable Discord homework notifications.",
      },
      503
    );
  }

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

  if (!result.ok) {
    console.error("Homework Discord error", result.status, result.detail);
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

    const webhook = resolveHomeworkWebhook(env);
    if (!webhook) {
      console.error("homework-photo: no Discord webhook configured");
      return jsonResponse(
        {
          error:
            "Photo upload is not set up on the server yet. Ask JD to enable homework notifications in Discord.",
        },
        503
      );
    }

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
    if (!result.ok) {
      console.error("Homework photo Discord error", result.status, result.detail);
      return jsonResponse(
        { error: "Could not send photo. Please try again in a few minutes." },
        502
      );
    }

    return jsonResponse({
      success: true,
      message: "Photo sent! JD can see it in Discord.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-photo-upload failed:", detail);
    return jsonResponse({ error: "Photo upload failed. Please try again later." }, 500);
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
    const result = await publishToStudentHub(data, env);
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

    return env.ASSETS.fetch(request);
  },
};
