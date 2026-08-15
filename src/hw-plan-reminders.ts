/**
 * Recurring “make HW for student” pings → Discord notify + Teacher Hub (kind=reminder).
 * Armed when a plan is activated; interval depends on tier (Basic 21d, Premium/Ultra/SS 5d).
 */

import { saveFeatureReport } from "./homework-kv";
import type { AccountTier } from "./user-accounts";

export interface HwPlanReminderEnv {
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_CHANNEL_ID?: string;
}

export interface HwPlanReminderJob {
  username: string;
  displayName?: string;
  plan: string;
  tier: AccountTier;
  intervalDays: number;
  nextFireAt: string;
  createdAt: string;
  lastFiredAt?: string;
}

const JOB_PREFIX = "hw-ping:";

function jobKey(username: string): string {
  return `${JOB_PREFIX}${String(username || "")
    .trim()
    .toLowerCase()}`;
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

export function planLabelFromTier(tier: AccountTier | string): string {
  switch (tier) {
    case "tier1":
      return "Basic";
    case "tier2":
      return "Premium";
    case "tier3":
      return "Ultra";
    case "student_special":
      return "Student Special";
    default:
      return String(tier || "plan");
  }
}

/** Days between HW-due teacher pings. */
export function intervalDaysForTier(tier: AccountTier | string): number | null {
  if (tier === "tier1") return 21;
  if (tier === "tier2" || tier === "tier3" || tier === "student_special") return 5;
  return null;
}

export function mapCheckoutPlanToTier(
  plan: string
): AccountTier | null {
  const p = String(plan || "")
    .trim()
    .toLowerCase();
  if (p === "basic" || p === "tier1") return "tier1";
  if (p === "premium" || p === "tier2") return "tier2";
  if (p === "ultra" || p === "tier3") return "tier3";
  if (p === "student-special" || p === "student_special") return "student_special";
  if (p === "student-ultra" || p === "student_ultra") return "tier3";
  return null;
}

function addDaysIso(fromMs: number, days: number): string {
  return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function clearHwPlanReminder(
  username: string,
  env: HwPlanReminderEnv
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return;
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return;
  await kv.delete(jobKey(user));
}

export async function armHwPlanReminder(
  opts: {
    username: string;
    displayName?: string;
    tier: AccountTier;
    /** If true, schedule first fire from now (new activate). If false and job exists, keep nextFireAt when interval unchanged. */
    resetSchedule?: boolean;
  },
  env: HwPlanReminderEnv
): Promise<HwPlanReminderJob | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = String(opts.username || "")
    .trim()
    .toLowerCase();
  if (!username) throw new Error("USERNAME_REQUIRED");

  const intervalDays = intervalDaysForTier(opts.tier);
  if (!intervalDays) {
    await clearHwPlanReminder(username, env);
    return null;
  }

  const plan = planLabelFromTier(opts.tier);
  const now = Date.now();
  let existing: HwPlanReminderJob | null = null;
  try {
    const raw = await kv.get(jobKey(username));
    if (raw) existing = JSON.parse(raw) as HwPlanReminderJob;
  } catch {
    existing = null;
  }

  const reset = opts.resetSchedule !== false;
  let nextFireAt: string;
  if (
    !reset &&
    existing &&
    existing.intervalDays === intervalDays &&
    existing.nextFireAt &&
    !Number.isNaN(new Date(existing.nextFireAt).getTime())
  ) {
    nextFireAt = existing.nextFireAt;
  } else {
    nextFireAt = addDaysIso(now, intervalDays);
  }

  const job: HwPlanReminderJob = {
    username,
    displayName: String(opts.displayName || existing?.displayName || "").trim() || undefined,
    plan,
    tier: opts.tier,
    intervalDays,
    nextFireAt,
    createdAt: existing?.createdAt || new Date(now).toISOString(),
    lastFiredAt: existing?.lastFiredAt,
  };

  await kv.put(jobKey(username), JSON.stringify(job));
  return job;
}

async function postDiscordHwPing(
  webhookUrl: string,
  message: string
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

function buildMessage(job: HwPlanReminderJob): string {
  const who = job.displayName ? `${job.displayName} (${job.username})` : job.username;
  return [
    "Homework Hub — make HW for student",
    `Student: ${who}`,
    `Plan: ${job.plan}`,
    `Cadence: every ${job.intervalDays} day${job.intervalDays === 1 ? "" : "s"}`,
  ].join("\n");
}

async function fireOne(
  job: HwPlanReminderJob,
  env: HwPlanReminderEnv
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return;

  const key = jobKey(job.username);
  const claimed = await kv.get(key);
  if (!claimed) return;

  let current: HwPlanReminderJob;
  try {
    current = JSON.parse(claimed) as HwPlanReminderJob;
  } catch {
    await kv.delete(key);
    return;
  }

  // Stale / already advanced
  const dueAt = new Date(current.nextFireAt).getTime();
  if (Number.isNaN(dueAt) || dueAt > Date.now()) return;

  const message = buildMessage(current);
  let discordOk = false;
  let hubOk = false;

  const webhookUrl = sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
  if (webhookUrl) {
    const channelError = await getWebhookChannelMismatch(
      webhookUrl,
      env.DISCORD_CHANNEL_ID
    );
    if (channelError) {
      console.error("hw-plan-reminders:", channelError);
    } else {
      discordOk = await postDiscordHwPing(webhookUrl, message);
      if (!discordOk) {
        console.error("hw-plan-reminders: Discord post failed for", current.username);
      }
    }
  } else {
    console.error("hw-plan-reminders: DISCORD_WEBHOOK_URL not configured");
  }

  try {
    await saveFeatureReport(
      {
        kind: "reminder",
        displayName: `Make HW — ${current.plan} — ${current.username}`,
        page: "HW plan reminder",
        username: current.username,
        message,
      },
      env
    );
    hubOk = true;
  } catch (err) {
    console.error("hw-plan-reminders: Teacher Hub save failed", current.username, err);
  }

  const now = Date.now();
  const next: HwPlanReminderJob = {
    ...current,
    lastFiredAt: new Date(now).toISOString(),
    nextFireAt: addDaysIso(now, current.intervalDays),
  };

  if (!discordOk && !hubOk) {
    // Leave due so next minute can retry; bump nextFireAt only after at least one channel works.
    console.error("hw-plan-reminders: both channels failed; will retry", current.username);
    return;
  }

  await kv.put(key, JSON.stringify(next));
}

export async function runHwPlanReminders(env: HwPlanReminderEnv): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) {
    console.error("hw-plan-reminders: HOMEWORK_KV not configured");
    return;
  }

  const now = Date.now();
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: JOB_PREFIX, cursor, limit: 100 });
    for (const entry of page.keys) {
      const raw = await kv.get(entry.name);
      if (!raw) continue;
      try {
        const job = JSON.parse(raw) as HwPlanReminderJob;
        const t = new Date(job.nextFireAt).getTime();
        if (!Number.isNaN(t) && t <= now) {
          await fireOne(job, env);
        }
      } catch (err) {
        console.error("hw-plan-reminders: fire failed", entry.name, err);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
