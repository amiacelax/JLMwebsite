/**
 * Scheduled Shorts/Reels pings → Discord notify channel + Teacher Hub (kind=reminder).
 * Armed via POST /api/social-reminders; fired by Worker cron `* * * * *`.
 */

import { saveFeatureReport } from "./homework-kv";

export interface SocialReminderEnv {
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_CHANNEL_ID?: string;
  HW_TEACHER_USER?: string;
}

export type SocialReminderStatus = "pending" | "fired" | "cancelled";

export interface SocialReminderJob {
  id: string;
  status: SocialReminderStatus;
  fireAtUtc: string;
  clipTitles: string;
  ytPinComment: string;
  igStoryCaption: string;
  linkSticker: string;
  createdAt: string;
  firedAt?: string;
}

export interface SocialReminderArmPayload {
  fireAtUtc?: string;
  clipTitles?: string;
  ytPinComment?: string;
  igStoryCaption?: string;
  linkSticker?: string;
  /** Teacher login check (same pattern as other hub list APIs). */
  teacherUsername?: string;
  username?: string;
}

const PENDING_PREFIX = "sr-pending:";
const DONE_PREFIX = "sr-done:";
const DEFAULT_LINK = "https://japaneselanguagementor.com/#contact";
const DEFAULT_STORY = "Free trial ↑";
const DEFAULT_PIN =
  "Free trial Japanese lesson → https://japaneselanguagementor.com/#contact";

function pendingKey(id: string): string {
  return `${PENDING_PREFIX}${id}`;
}

function doneKey(id: string): string {
  return `${DONE_PREFIX}${id}`;
}

function makeId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `sr-${Date.now()}-${rand}`;
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
    return null;
  }
  return url;
}

async function getWebhookChannelMismatch(
  webhookUrl: string,
  expectedChannelId: string | undefined
): Promise<string | null> {
  const expected = expectedChannelId?.trim();
  if (!expected) return null;

  const res = await fetch(webhookUrl);
  if (!res.ok) return "Could not verify Discord webhook configuration.";

  const wh = (await res.json()) as { channel_id?: string };
  if (wh.channel_id === expected) return null;

  return `Discord webhook is not pointed at the notify channel (expected channel ${expected}).`;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function buildSocialReminderMessage(job: SocialReminderJob): string {
  return [
    "YouTube/Instagram Reminder",
    `YT: Write ${job.ytPinComment} for ${job.clipTitles}.`,
    `IG: Write this caption ${job.igStoryCaption} and sticker ${job.linkSticker}`,
  ].join("\n");
}

async function postDiscordReminder(
  webhookUrl: string,
  message: string,
  _clipTitles: string
): Promise<boolean> {
  const plain = String(message || "")
    .replace(/\r\n/g, "\n")
    .replace(/```/g, "'''")
    .trim()
    .slice(0, 1980);
  const content = "```\n" + plain + "\n```";
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

function parseFireAtUtc(raw: string | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function assertTeacherArm(
  env: SocialReminderEnv,
  payload: SocialReminderArmPayload
): boolean {
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const given = String(payload.teacherUsername || payload.username || "")
    .trim()
    .toLowerCase();
  return given === allowed;
}

export async function armSocialReminder(
  payload: SocialReminderArmPayload,
  env: SocialReminderEnv
): Promise<SocialReminderJob> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const fireAtUtc = parseFireAtUtc(payload.fireAtUtc);
  if (!fireAtUtc) throw new Error("FIRE_AT_REQUIRED");

  const clipTitles = String(payload.clipTitles || "").trim();
  if (!clipTitles) throw new Error("TITLES_REQUIRED");
  if (clipTitles.length > 300) throw new Error("TITLES_TOO_LONG");

  const ytPinComment = String(payload.ytPinComment || DEFAULT_PIN).trim() || DEFAULT_PIN;
  const igStoryCaption =
    String(payload.igStoryCaption || DEFAULT_STORY).trim() || DEFAULT_STORY;
  const linkSticker =
    String(payload.linkSticker || DEFAULT_LINK).trim() || DEFAULT_LINK;

  if (ytPinComment.length > 1000) throw new Error("PIN_TOO_LONG");
  if (igStoryCaption.length > 500) throw new Error("STORY_TOO_LONG");
  if (linkSticker.length > 500) throw new Error("LINK_TOO_LONG");

  const id = makeId();
  const job: SocialReminderJob = {
    id,
    status: "pending",
    fireAtUtc,
    clipTitles: clipTitles.slice(0, 300),
    ytPinComment: ytPinComment.slice(0, 1000),
    igStoryCaption: igStoryCaption.slice(0, 500),
    linkSticker: linkSticker.slice(0, 500),
    createdAt: new Date().toISOString(),
  };

  await kv.put(pendingKey(id), JSON.stringify(job));
  return job;
}

export async function listPendingSocialReminders(
  env: SocialReminderEnv
): Promise<SocialReminderJob[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const jobs: SocialReminderJob[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: PENDING_PREFIX, cursor, limit: 100 });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      try {
        jobs.push(JSON.parse(raw) as SocialReminderJob);
      } catch {
        /* skip */
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return jobs.sort(
    (a, b) => new Date(a.fireAtUtc).getTime() - new Date(b.fireAtUtc).getTime()
  );
}

export async function cancelSocialReminder(
  id: string,
  env: SocialReminderEnv
): Promise<boolean> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const key = pendingKey(id);
  const raw = await kv.get(key);
  if (!raw) return false;
  await kv.delete(key);
  try {
    const job = JSON.parse(raw) as SocialReminderJob;
    job.status = "cancelled";
    await kv.put(doneKey(id), JSON.stringify(job), {
      expirationTtl: 60 * 60 * 24 * 14,
    });
  } catch {
    /* ignore */
  }
  return true;
}

async function fireOne(
  job: SocialReminderJob,
  env: SocialReminderEnv
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return;

  // Claim first to avoid double-fire if cron overlaps.
  const claimed = await kv.get(pendingKey(job.id));
  if (!claimed) return;
  await kv.delete(pendingKey(job.id));

  const message = buildSocialReminderMessage(job);
  let discordOk = false;
  let hubOk = false;

  const webhookUrl = sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
  if (webhookUrl) {
    const channelError = await getWebhookChannelMismatch(
      webhookUrl,
      env.DISCORD_CHANNEL_ID
    );
    if (channelError) {
      console.error("social-reminders:", channelError);
    } else {
      discordOk = await postDiscordReminder(webhookUrl, message, job.clipTitles);
      if (!discordOk) {
        console.error("social-reminders: Discord post failed for", job.id);
      }
    }
  } else {
    console.error("social-reminders: DISCORD_WEBHOOK_URL not configured");
  }

  try {
    await saveFeatureReport(
      {
        kind: "reminder",
        displayName: `YouTube/Instagram Reminder — ${job.clipTitles}`,
        page: "Social reminder",
        username: "jlm",
        message,
      },
      env
    );
    hubOk = true;
  } catch (err) {
    console.error("social-reminders: Teacher Hub save failed", job.id, err);
  }

  const done: SocialReminderJob = {
    ...job,
    status: "fired",
    firedAt: new Date().toISOString(),
  };
  await kv.put(doneKey(job.id), JSON.stringify({ ...done, discordOk, hubOk }), {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  if (!discordOk && !hubOk) {
    // Re-queue once so a transient outage can still deliver on the next minute.
    console.error("social-reminders: both channels failed; re-queueing", job.id);
    await kv.put(pendingKey(job.id), JSON.stringify(job));
  }
}

export async function runSocialReminders(env: SocialReminderEnv): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) {
    console.error("social-reminders: HOMEWORK_KV not configured");
    return;
  }

  const now = Date.now();
  const pending = await listPendingSocialReminders(env);
  const due = pending.filter((j) => {
    const t = new Date(j.fireAtUtc).getTime();
    return !Number.isNaN(t) && t <= now;
  });

  for (const job of due) {
    try {
      await fireOne(job, env);
    } catch (err) {
      console.error("social-reminders: fire failed", job.id, err);
    }
  }
}
