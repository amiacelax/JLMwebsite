/**
 * Weekly Discord ping: who needs new HW / who’s waiting on review.
 * Fires Monday 5:00am Japan time (cron `0 20 * * 0` = Sunday 20:00 UTC). Posts to the HW channel.
 */

import {
  collectHwDailyWaitingReport,
  type HwDailyWaitingRow,
} from "./homework-kv";
import { listCadenceOwesNewHw } from "./hw-plan-reminders";
import { getJstYmd } from "./student-birthdays";
import { resolveRoutedWebhook, type DiscordRouteEnv } from "./discord-channels";
import { studentPageLink, teacherReviewLink } from "./hub-links";

export interface HwDailyWaitingEnv extends DiscordRouteEnv {
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_CHANNEL_ID?: string;
}

const ALERT_PREFIX = "hw-daily-waiting:";

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

function formatJstWeekday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
}

function lineFor(row: HwDailyWaitingRow): string {
  const open =
    row.bucket === "review" && row.submissionId
      ? teacherReviewLink(row.submissionId)
      : studentPageLink(row.username);
  const who = row.title ? `${row.displayName} — ${row.title}` : row.displayName;
  return `• ${who}\n  ${open}`;
}

function section(title: string, rows: HwDailyWaitingRow[]): string[] {
  if (!rows.length) return [`${title}`, "(none)", ""];
  return [title, ...rows.map(lineFor), ""];
}

export function buildHwDailyWaitingMessage(
  report: Awaited<ReturnType<typeof collectHwDailyWaitingReport>>,
  now = new Date()
): string {
  const lines = [
    `📋 HW waiting (weekly) — ${formatJstWeekday(now)}`,
    "",
    ...section("Needs new HW:", report.needs),
    ...section("Need to be reviewed by you:", report.review),
    ...section("Student still reviewing JD notes:", report.reviewingNotes),
    ...section("Student needs to complete HW:", report.sent),
  ];
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

async function postDiscord(
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

export async function runHwDailyWaitingReminders(
  env: HwDailyWaitingEnv,
  opts?: { force?: boolean }
): Promise<{ ok: boolean; skipped?: boolean; message?: string }> {
  const force = opts?.force === true;
  const hook = await resolveRoutedWebhook(env, "hw");
  const webhookUrl = hook?.url ?? null;
  if (!webhookUrl) {
    console.error("hw-daily-waiting: no Discord webhook configured");
    return { ok: false, message: "Webhook not configured" };
  }

  const channelError = await getWebhookChannelMismatch(
    webhookUrl,
    hook?.channelId
  );
  if (channelError) {
    console.error("hw-daily-waiting:", channelError);
    return { ok: false, message: channelError };
  }

  const kv = env.HOMEWORK_KV;
  if (!kv) {
    console.error("hw-daily-waiting: HOMEWORK_KV not configured");
    return { ok: false, message: "KV not configured" };
  }

  const { year, month, day } = getJstYmd();
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const alertKey = `${ALERT_PREFIX}${ymd}`;

  /* Force/manual sends must NOT write the daily key — tonight’s 9pm still fires. */
  if (!force) {
    const already = await kv.get(alertKey);
    if (already) return { ok: true, skipped: true };
  }

  let report;
  try {
    report = await collectHwDailyWaitingReport(env);
    const owed = await listCadenceOwesNewHw(env);
    /* Cadence only adds "make a new sheet" for students who aren't already
       waiting on you / mid-HW / reading notes — those don't need a new sheet. */
    const already = new Set(
      [...report.needs, ...report.review, ...report.sent, ...report.reviewingNotes].map(
        (row) => row.username
      )
    );
    for (const job of owed) {
      const username = String(job.username || "")
        .trim()
        .toLowerCase();
      if (!username || already.has(username)) continue;
      already.add(username);
      report.needs.push({
        username,
        displayName: String(job.displayName || username).trim() || username,
        title: "cadence — make a new sheet",
        bucket: "needs",
      });
    }
    report.needs.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (err) {
    console.error("hw-daily-waiting: collect failed", err);
    return { ok: false, message: "Could not collect homework status" };
  }

  const message = buildHwDailyWaitingMessage(report);
  const ok = await postDiscord(webhookUrl, message);
  if (!ok) {
    console.error("hw-daily-waiting: Discord post failed");
    return { ok: false, message: "Discord post failed" };
  }

  if (!force) {
    await kv.put(alertKey, "1", { expirationTtl: 60 * 60 * 48 });
  }
  return { ok: true, message };
}
