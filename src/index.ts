interface Env {
  ASSETS: Fetcher;
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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  const result = await notifyHomeworkDiscord(webhookUrl, bodyText);

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

    return env.ASSETS.fetch(request);
  },
};
