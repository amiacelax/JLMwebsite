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

function sanitizeSnowflake(raw: string | undefined | null): string {
  const id = String(raw || "").trim();
  if (!/^\d{5,32}$/.test(id)) return "";
  return id;
}

function sanitizeBotToken(raw: string | undefined | null): string {
  return String(raw || "").trim();
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
  const res = await fetch(DISCORD_API + path, {
    method,
    headers: {
      Authorization: "Bot " + token,
      "Content-Type": "application/json",
      "User-Agent": "JapaneseLanguageMentor-HomeworkHub/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
  if (!token) return { ok: false, status: 0, detail: "DISCORD_BOT_TOKEN missing" };
  if (!snowflake) return { ok: false, status: 0, detail: "Invalid Discord user id" };
  if (!message) return { ok: false, status: 0, detail: "Empty message" };

  const channel = await discordApi(token, "POST", "/users/@me/channels", {
    recipient_id: snowflake,
  });
  if (!channel.ok) {
    return { ok: false, status: channel.status, detail: channel.detail };
  }
  const channelId = String(channel.json.id || "").trim();
  if (!channelId) {
    return { ok: false, status: channel.status, detail: "No DM channel id" };
  }

  const sent = await discordApi(token, "POST", "/channels/" + channelId + "/messages", {
    content: message,
  });
  return { ok: sent.ok, status: sent.status, detail: sent.detail };
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
      body: JSON.stringify({ content: String(content || "").trim().slice(0, 1900) }),
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
 * Never throws — safe to call from publish/review paths.
 */
export async function notifyStudentWithTeacherFallback(
  env: DiscordNotifyEnv,
  opts: {
    studentUsername: string;
    discordUserId?: string | null;
    studentContent: string;
    teacherContent: string;
  }
): Promise<DiscordNotifyResult> {
  try {
    const studentId = sanitizeSnowflake(opts.discordUserId);
    if (studentId) {
      const dm = await dmDiscordUser(env, studentId, opts.studentContent);
      if (dm.ok) return { ok: true, mode: "student_dm" };
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
