/** Discord bot DMs for student homework events (with teacher fallback). */

export interface DiscordNotifyEnv {
  DISCORD_BOT_TOKEN?: string;
  DISCORD_TEACHER_USER_ID?: string;
  DISCORD_HOMEWORK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
}

export type DiscordNotifyMode =
  | "student_dm"
  | "teacher_dm"
  | "teacher_dm_after_student_fail"
  | "webhook"
  | "skipped";

export interface DiscordNotifyResult {
  ok: boolean;
  mode: DiscordNotifyMode;
  detail?: string;
}

const DISCORD_API = "https://discord.com/api/v10";
/** Discord MessageFlags.SUPPRESS_EMBEDS — no link preview / image embed. */
const DISCORD_SUPPRESS_EMBEDS = 4;

function sanitizeSnowflake(raw: string | undefined | null): string {
  const id = String(raw || "").trim();
  if (!/^\d{5,32}$/.test(id)) return "";
  return id;
}

function sanitizeBotToken(raw: string | undefined | null): string {
  let token = String(raw || "").trim();
  // Paste mistakes: quotes, or already including Discord's "Bot " scheme
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (/^Bot\s+/i.test(token)) {
    token = token.replace(/^Bot\s+/i, "").trim();
  }
  // Wrangler / clipboard sometimes inserts newlines or spaces mid-token
  token = token.replace(/\s+/g, "");
  // Webhook URLs are not bot tokens — would always 401
  if (/^https?:\/\//i.test(token) || /discord\.com\/api\/webhooks/i.test(token)) {
    return "";
  }
  // Real Discord bot tokens are three base64url-ish segments joined by dots
  if (!token || token.split(".").length < 3) {
    return "";
  }
  return token;
}

/** Short teacher-facing hint; never include the token itself. */
function formatDmFailHint(status: number, detail: string): string {
  if (status === 401) {
    return (
      "bot token unauthorized (401) — reset token in Discord Developer Portal " +
      "and re-set DISCORD_BOT_TOKEN secret"
    );
  }
  if (status === 403) {
    return (
      "bot forbidden (403) — student may have DMs closed, or bot cannot DM them"
    );
  }
  if (status === 404) {
    return "Discord user not found (404) — check the student’s Discord user ID";
  }
  if (!detail) return status ? "HTTP " + status : "unknown";
  // Prefer Discord's message field when present
  if (detail.startsWith("{")) {
    try {
      const parsed = JSON.parse(detail) as { message?: string; code?: number };
      if (parsed.message) {
        return (
          "HTTP " +
          status +
          (parsed.code != null ? " (" + parsed.code + ")" : "") +
          " — " +
          String(parsed.message).slice(0, 160)
        );
      }
    } catch {
      /* fall through */
    }
    if (detail.length > 80) return "HTTP " + status + " from Discord";
  }
  return detail.slice(0, 200);
}

function webhookUrl(env: DiscordNotifyEnv): string {
  const hw = String(env.DISCORD_HOMEWORK_WEBHOOK_URL || "").trim();
  if (hw.startsWith("https://")) return hw;
  const site = String(env.DISCORD_WEBHOOK_URL || "").trim();
  if (site.startsWith("https://")) return site;
  return "";
}

async function discordApi(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; detail: string }> {
  const headers: Record<string, string> = {
    Authorization: "Bot " + token,
    "User-Agent": "JapaneseLanguageMentor-HomeworkHub/1.0",
  };
  const init: RequestInit = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(DISCORD_API + path, init);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* plain text error */
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    detail: text.slice(0, 400),
  };
}

/** Open (or reuse) a DM channel and send a plain-text message. */
export async function dmDiscordUser(
  env: DiscordNotifyEnv,
  userId: string,
  content: string
): Promise<{ ok: boolean; status: number; detail: string }> {
  const token = sanitizeBotToken(env.DISCORD_BOT_TOKEN);
  const snowflake = sanitizeSnowflake(userId);
  const message = String(content || "").trim().slice(0, 1900);
  if (!token) {
    const raw = String(env.DISCORD_BOT_TOKEN || "").trim();
    if (raw && /^https?:\/\//i.test(raw)) {
      return {
        ok: false,
        status: 0,
        detail: "DISCORD_BOT_TOKEN looks like a URL — use the bot token, not a webhook",
      };
    }
    return { ok: false, status: 0, detail: "DISCORD_BOT_TOKEN missing" };
  }
  if (!snowflake) return { ok: false, status: 0, detail: "Invalid Discord user id" };
  if (!message) return { ok: false, status: 0, detail: "Empty message" };

  const channel = await discordApi(token, "POST", "/users/@me/channels", {
    recipient_id: snowflake,
  });
  if (!channel.ok) {
    return {
      ok: false,
      status: channel.status,
      detail: formatDmFailHint(channel.status, channel.detail),
    };
  }
  const channelId = String(channel.json.id || "").trim();
  if (!channelId) {
    return { ok: false, status: channel.status, detail: "No DM channel id" };
  }

  const sent = await discordApi(token, "POST", "/channels/" + channelId + "/messages", {
    content: message,
    flags: DISCORD_SUPPRESS_EMBEDS,
  });
  return {
    ok: sent.ok,
    status: sent.status,
    detail: sent.ok ? sent.detail : formatDmFailHint(sent.status, sent.detail),
  };
}

async function postWebhookFallback(
  env: DiscordNotifyEnv,
  content: string
): Promise<{ ok: boolean; detail: string }> {
  const url = webhookUrl(env);
  if (!url) return { ok: false, detail: "No Discord webhook configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: String(content || "").trim().slice(0, 1900),
        flags: DISCORD_SUPPRESS_EMBEDS,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, detail: detail.slice(0, 400) || "webhook " + res.status };
    }
    return { ok: true, detail: "webhook" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "webhook failed" };
  }
}

async function notifyTeacher(
  env: DiscordNotifyEnv,
  content: string
): Promise<DiscordNotifyResult> {
  const teacherId = sanitizeSnowflake(env.DISCORD_TEACHER_USER_ID);
  if (teacherId && sanitizeBotToken(env.DISCORD_BOT_TOKEN)) {
    const dm = await dmDiscordUser(env, teacherId, content);
    if (dm.ok) return { ok: true, mode: "teacher_dm" };
    console.warn("discord teacher DM failed:", dm.status, dm.detail);
  }
  const hook = await postWebhookFallback(env, content);
  if (hook.ok) return { ok: true, mode: "webhook", detail: hook.detail };
  return { ok: false, mode: "skipped", detail: hook.detail };
}

/**
 * DM the student when they have a Discord id; otherwise (or on DM failure) ping JD.
 * Optionally also DM the teacher a copy when the student DM succeeds.
 * Never throws — safe to call from publish/review paths.
 */
export async function notifyStudentWithTeacherFallback(
  env: DiscordNotifyEnv,
  opts: {
    studentUsername: string;
    discordUserId?: string | null;
    studentContent: string;
    teacherContent: string;
    /** When student DM succeeds, also DM teacher this (or a prefixed student copy). */
    copyTeacherOnStudentDm?: boolean;
    teacherCopyContent?: string;
  }
): Promise<DiscordNotifyResult> {
  try {
    const studentId = sanitizeSnowflake(opts.discordUserId);
    if (studentId) {
      const dm = await dmDiscordUser(env, studentId, opts.studentContent);
      if (dm.ok) {
        if (opts.copyTeacherOnStudentDm) {
          const teacherId = sanitizeSnowflake(env.DISCORD_TEACHER_USER_ID);
          if (teacherId && sanitizeBotToken(env.DISCORD_BOT_TOKEN)) {
            const copy =
              String(opts.teacherCopyContent || "").trim() ||
              "（→ " + opts.studentUsername + "）\n" + opts.studentContent;
            const copyDm = await dmDiscordUser(env, teacherId, copy);
            if (!copyDm.ok) {
              console.warn(
                "discord teacher copy DM failed:",
                copyDm.status,
                copyDm.detail
              );
            }
          }
        }
        return { ok: true, mode: "student_dm" };
      }
      console.warn(
        "discord student DM failed for",
        opts.studentUsername,
        dm.status,
        dm.detail
      );
      const fallback = await notifyTeacher(
        env,
        opts.teacherContent +
          "\n(Also: student DM failed — " +
          (dm.detail || "unknown") +
          ")"
      );
      return {
        ok: fallback.ok,
        mode: fallback.ok ? "teacher_dm_after_student_fail" : fallback.mode,
        detail: dm.detail,
      };
    }

    return await notifyTeacher(env, opts.teacherContent);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "notify failed";
    console.error("discord notify error:", detail);
    return { ok: false, mode: "skipped", detail };
  }
}

export function normalizeDiscordUserId(raw: string | undefined | null): string {
  return sanitizeSnowflake(raw);
}

export interface DiscordBotStatus {
  ok: boolean;
  tokenConfigured: boolean;
  teacherIdConfigured: boolean;
  hasHomeworkWebhook: boolean;
  botUsername?: string;
  botId?: string;
  status?: number;
  hint?: string;
  /** Non-secret shape info so you can see paste mistakes without revealing the token. */
  tokenShape?: {
    length: number;
    dotParts: number;
    looksLikeUrl: boolean;
    looksLikeSnowflake: boolean;
    looksLikeHexKey: boolean;
  };
}

/** Inspect token shape without exposing the value. */
function describeTokenShape(raw: string): DiscordBotStatus["tokenShape"] {
  let cleaned = String(raw || "").trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (/^Bot\s+/i.test(cleaned)) cleaned = cleaned.replace(/^Bot\s+/i, "").trim();
  cleaned = cleaned.replace(/\s+/g, "");
  return {
    length: cleaned.length,
    dotParts: cleaned ? cleaned.split(".").length : 0,
    looksLikeUrl: /^https?:\/\//i.test(cleaned) || /discord\.com\/api\/webhooks/i.test(cleaned),
    looksLikeSnowflake: /^\d{5,32}$/.test(cleaned),
    looksLikeHexKey: /^[0-9a-f]{32,128}$/i.test(cleaned),
  };
}

/**
 * Probe Discord GET /users/@me with the bot token.
 * Never returns the token itself.
 */
export async function getDiscordBotStatus(env: DiscordNotifyEnv): Promise<DiscordBotStatus> {
  const teacherIdConfigured = Boolean(sanitizeSnowflake(env.DISCORD_TEACHER_USER_ID));
  const hasHomeworkWebhook = Boolean(webhookUrl(env));
  const token = sanitizeBotToken(env.DISCORD_BOT_TOKEN);
  const raw = String(env.DISCORD_BOT_TOKEN || "").trim();
  const tokenShape = raw ? describeTokenShape(raw) : undefined;

  if (!token) {
    let hint = "DISCORD_BOT_TOKEN missing — set it with: npx wrangler secret put DISCORD_BOT_TOKEN";
    if (tokenShape?.looksLikeUrl) {
      hint = "DISCORD_BOT_TOKEN looks like a URL — paste the bot token, not a webhook URL";
    } else if (tokenShape?.looksLikeSnowflake) {
      hint =
        "DISCORD_BOT_TOKEN looks like an Application/User ID (digits only) — use Bot → Reset Token instead";
    } else if (tokenShape?.looksLikeHexKey) {
      hint =
        "DISCORD_BOT_TOKEN looks like a Public Key / Client Secret — use Bot → Reset Token (token has two dots)";
    } else if (raw && tokenShape && tokenShape.dotParts < 3) {
      hint =
        "DISCORD_BOT_TOKEN needs the Bot token (3 parts with dots, e.g. xxx.yyy.zzz). You pasted something with " +
        tokenShape.dotParts +
        " part(s), length " +
        tokenShape.length;
    } else if (raw) {
      hint = "DISCORD_BOT_TOKEN is set but invalid format — re-set the bot token secret";
    }
    return {
      ok: false,
      tokenConfigured: Boolean(raw),
      teacherIdConfigured,
      hasHomeworkWebhook,
      hint,
      tokenShape,
    };
  }

  const me = await discordApi(token, "GET", "/users/@me");
  if (!me.ok) {
    const hint = formatDmFailHint(me.status, me.detail);
    return {
      ok: false,
      tokenConfigured: true,
      teacherIdConfigured,
      hasHomeworkWebhook,
      status: me.status,
      tokenShape,
      hint:
        hint === "HTTP " + me.status || hint === "HTTP " + me.status + " from Discord"
          ? hint + (me.detail ? " — " + me.detail.slice(0, 180) : "")
          : hint,
    };
  }

  const botUsername = String(me.json.username || "").trim() || undefined;
  const botId = String(me.json.id || "").trim() || undefined;
  let hint: string | undefined;
  if (!teacherIdConfigured) {
    hint = "Bot token works — set DISCORD_TEACHER_USER_ID for teacher DM fallback";
  } else if (!hasHomeworkWebhook) {
    hint = "Bot token works — homework webhook missing (channel fallback unavailable)";
  }

  return {
    ok: true,
    tokenConfigured: true,
    teacherIdConfigured,
    hasHomeworkWebhook,
    botUsername,
    botId,
    hint,
    tokenShape,
  };
}
