/**
 * Recurring “make HW for student” pings → Discord notify + Teacher Hub (kind=reminder).
 * Armed when a plan is activated; interval depends on tier (Basic 21d, Premium/Ultra/SS 5d).
 */

import {
  collectHwDailyWaitingReport,
  saveFeatureReport,
  skipHwWaitingPing,
  type HwDailyWaitingReport,
} from "./homework-kv";
import { studentPageLink, teacherReviewLink } from "./hub-links";
import type { AccountTier } from "./user-accounts";
import { isDemoUser, resolveRoutedWebhook, type DiscordRouteEnv } from "./discord-channels";

export interface HwPlanReminderEnv extends DiscordRouteEnv {
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
  /**
   * Cadence pinged and JD still owes a new sheet.
   * false = fulfilled by a later publish. Missing + lastFiredAt = still open (older jobs).
   */
  awaitingNewHw?: boolean;
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
    case "quest_only":
      return "Quest Only";
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
  if (p === "quest-only" || p === "quest_only") return "quest_only";
  return null;
}

function addDaysIso(fromMs: number, days: number): string {
  return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Cadence already fired and a new sheet hasn’t been published since. */
export function cadenceStillOwesNewHw(job: HwPlanReminderJob, now = Date.now()): boolean {
  if (job.awaitingNewHw === false) return false;
  if (job.awaitingNewHw === true) return true;
  if (!job.lastFiredAt) return false;
  const next = new Date(job.nextFireAt).getTime();
  return !Number.isNaN(next) && next > now;
}

export async function listCadenceOwesNewHw(
  env: HwPlanReminderEnv
): Promise<HwPlanReminderJob[]> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return [];
  const now = Date.now();
  const out: HwPlanReminderJob[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: JOB_PREFIX, cursor, limit: 100 });
    for (const entry of page.keys) {
      const raw = await kv.get(entry.name);
      if (!raw) continue;
      try {
        const job = JSON.parse(raw) as HwPlanReminderJob;
        if (skipHwWaitingPing(job.username, job.displayName)) continue;
        if (cadenceStillOwesNewHw(job, now)) out.push(job);
      } catch {
        /* skip */
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

/** New sheet actually landed on the student’s hub — cadence owe is done. */
export async function fulfillHwPlanAwaitingNew(
  username: string,
  env: HwPlanReminderEnv
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return;
  const user = String(username || "")
    .trim()
    .toLowerCase();
  if (!user) return;
  const raw = await kv.get(jobKey(user));
  if (!raw) return;
  let job: HwPlanReminderJob;
  try {
    job = JSON.parse(raw) as HwPlanReminderJob;
  } catch {
    return;
  }
  if (job.awaitingNewHw === false && !job.lastFiredAt) return;
  job.awaitingNewHw = false;
  await kv.put(jobKey(user), JSON.stringify(job));
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

  /* Demo accounts and inactive students never get cadence pings. */
  if (isDemoUser(username) || skipHwWaitingPing(username, opts.displayName)) {
    await clearHwPlanReminder(username, env);
    return null;
  }

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
  const content = plain;
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
    studentPageLink(job.username),
  ].join("\n");
}

type CadenceKind = "needs" | "review" | "skip";

function buildReviewMessage(job: HwPlanReminderJob, title?: string, submissionId?: string): string {
  const who = job.displayName ? `${job.displayName} (${job.username})` : job.username;
  const open = submissionId ? teacherReviewLink(submissionId) : studentPageLink(job.username);
  return [
    "Homework Hub — still needs your review",
    `Student: ${who}`,
    title ? `Waiting: ${title}` : "",
    `Plan: ${job.plan}`,
    open,
  ]
    .filter(Boolean)
    .join("\n");
}

async function fireOne(
  job: HwPlanReminderJob,
  env: HwPlanReminderEnv,
  getReport?: () => Promise<HwDailyWaitingReport>
): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return;

  if (isDemoUser(job.username) || skipHwWaitingPing(job.username, job.displayName)) {
    await kv.delete(jobKey(job.username));
    return;
  }

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

  /* Only ask JD to make a new sheet when the student actually needs one.
     Waiting on JD's review → "still needs your review". HW already out / notes being read → stay quiet. */
  let kind: CadenceKind = "needs";
  let reviewTitle: string | undefined;
  let reviewSubmissionId: string | undefined;
  if (getReport) {
    try {
      const report = await getReport();
      const u = current.username;
      const inReview = report.review.find((r) => r.username === u);
      if (inReview) {
        kind = "review";
        reviewTitle = inReview.title;
        reviewSubmissionId = inReview.submissionId;
      } else if (
        report.sent.some((r) => r.username === u) ||
        report.reviewingNotes.some((r) => r.username === u)
      ) {
        kind = "skip";
      }
    } catch (err) {
      console.error("hw-plan-reminders: status lookup failed, sending normal ping", err);
    }
  }

  if (kind === "skip") {
    const quietNow = Date.now();
    await kv.put(
      key,
      JSON.stringify({
        ...current,
        nextFireAt: addDaysIso(quietNow, current.intervalDays),
        awaitingNewHw: false,
      } satisfies HwPlanReminderJob)
    );
    return;
  }

  const message =
    kind === "review" ? buildReviewMessage(current, reviewTitle, reviewSubmissionId) : buildMessage(current);
  let discordOk = false;
  let hubOk = false;

  const hook = await resolveRoutedWebhook(env, "hw");
  const webhookUrl = hook?.url ?? null;
  if (webhookUrl) {
    const channelError = await getWebhookChannelMismatch(
      webhookUrl,
      hook?.channelId
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
        displayName: `${kind === "review" ? "Review HW" : "Make HW"} — ${current.plan} — ${current.username}`,
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
    awaitingNewHw: kind === "needs",
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
  let report: Promise<HwDailyWaitingReport> | null = null;
  const getReport = () => (report ??= collectHwDailyWaitingReport(env));
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
          await fireOne(job, env, getReport);
        }
      } catch (err) {
        console.error("hw-plan-reminders: fire failed", entry.name, err);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
