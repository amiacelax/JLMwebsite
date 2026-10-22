import { isKnownStudent } from "./homework-kv";
import { sendWebPush, type PushSubscriptionKeys } from "./web-push";

const reminderKey = (username: string) => "hw-study-ping:" + username;

export interface StudyReminderEnv {
  HOMEWORK_KV?: KVNamespace;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
}

export interface StudyReminderRecord {
  username: string;
  enabled: boolean;
  message: string;
  time: string;
  repeat: "daily" | "weekdays" | "weekly" | "once";
  weekday: number;
  timeZone: string;
  lastSlot: string;
  subscriptions: PushSubscriptionKeys[];
}

function vapidKeys(env: StudyReminderEnv): { publicKey: string; privateJwk: JsonWebKey } | null {
  const publicKey = String(env.VAPID_PUBLIC_KEY || "").trim();
  const raw = String(env.VAPID_PRIVATE_JWK || "").trim();
  if (!publicKey || !raw) return null;
  try {
    const privateJwk = JSON.parse(raw) as JsonWebKey;
    if (!privateJwk || privateJwk.kty !== "EC") return null;
    return { publicKey, privateJwk };
  } catch {
    return null;
  }
}

function cleanSubscription(raw: unknown): PushSubscriptionKeys | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { endpoint?: string; keys?: { p256dh?: string; auth?: string }; p256dh?: string; auth?: string };
  const endpoint = String(row.endpoint || "").trim();
  const p256dh = String(row.keys?.p256dh || row.p256dh || "").trim();
  const auth = String(row.keys?.auth || row.auth || "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

function cleanRepeat(value: unknown): StudyReminderRecord["repeat"] {
  if (value === "weekdays" || value === "weekly" || value === "once") return value;
  return "daily";
}

async function loadReminder(env: StudyReminderEnv, username: string): Promise<StudyReminderRecord | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) return null;
  const raw = await kv.get(reminderKey(username));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StudyReminderRecord;
    if (!parsed || parsed.enabled === false) return null;
    if (!Array.isArray(parsed.subscriptions)) parsed.subscriptions = [];
    return parsed;
  } catch {
    return null;
  }
}

async function putReminder(env: StudyReminderEnv, record: StudyReminderRecord): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  await kv.put(reminderKey(record.username), JSON.stringify(record));
}

export function publicVapidKey(env: StudyReminderEnv): string {
  return String(env.VAPID_PUBLIC_KEY || "").trim();
}

export async function saveStudyReminder(
  env: StudyReminderEnv,
  input: {
    username?: string;
    message?: string;
    time?: string;
    repeat?: string;
    weekday?: unknown;
    timeZone?: string;
    subscription?: unknown;
  }
): Promise<StudyReminderRecord> {
  if (!env.HOMEWORK_KV) throw new Error("KV_NOT_CONFIGURED");
  const username = String(input.username || "").trim().toLowerCase();
  if (!username || !(await isKnownStudent(username, env))) throw new Error("UNKNOWN_STUDENT");
  const time = String(input.time || "");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("TIME_INVALID");
  const subscription = cleanSubscription(input.subscription);
  if (!subscription) throw new Error("SUBSCRIPTION_REQUIRED");
  const message = String(input.message || "Time to relax with Japanese").replace(/\s+/g, " ").trim().slice(0, 180) || "Time to relax with Japanese";
  const timeZone = String(input.timeZone || "Asia/Tokyo").trim().slice(0, 80) || "Asia/Tokyo";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error("TIMEZONE_INVALID");
  }
  const previous = await loadReminder(env, username);
  const subscriptions = (previous?.subscriptions || []).filter((row) => row.endpoint !== subscription.endpoint);
  subscriptions.push(subscription);
  const record: StudyReminderRecord = {
    username,
    enabled: true,
    message,
    time,
    repeat: cleanRepeat(input.repeat),
    weekday: Math.min(6, Math.max(0, Number(input.weekday) || 0)),
    timeZone,
    lastSlot: previous?.lastSlot || "",
    subscriptions: subscriptions.slice(-8),
  };
  await putReminder(env, record);
  return record;
}

function zonedNow(timeZone: string, now: Date): { hm: string; weekday: number; slot: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const bag: Record<string, string> = {};
    for (const part of parts) bag[part.type] = part.value;
    let hour = bag.hour || "";
    if (hour === "24") hour = "00";
    const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      hm: hour + ":" + (bag.minute || "00"),
      weekday: weekdays[bag.weekday] ?? -1,
      slot: (bag.year || "") + "-" + (bag.month || "") + "-" + (bag.day || "") + " " + hour + ":" + (bag.minute || "00"),
    };
  } catch {
    return null;
  }
}

function isDue(record: StudyReminderRecord, now: Date): { slot: string } | null {
  const zoned = zonedNow(record.timeZone || "Asia/Tokyo", now);
  if (!zoned || zoned.hm !== record.time || zoned.slot === record.lastSlot) return null;
  if (record.repeat === "weekdays" && (zoned.weekday === 0 || zoned.weekday === 6)) return null;
  if (record.repeat === "weekly" && zoned.weekday !== Number(record.weekday)) return null;
  return { slot: zoned.slot };
}

async function deliver(
  env: StudyReminderEnv,
  record: StudyReminderRecord
): Promise<{ record: StudyReminderRecord; sent: boolean }> {
  const keys = vapidKeys(env);
  if (!keys) throw new Error("PUSH_NOT_CONFIGURED");
  const kept: PushSubscriptionKeys[] = [];
  let sent = false;
  for (const subscription of record.subscriptions) {
    const result = await sendWebPush({
      subscription,
      message: record.message,
      vapidPublicKey: keys.publicKey,
      vapidPrivateJwk: keys.privateJwk,
      subject: "mailto:JD@japaneselanguagementor.com",
    });
    if (result === "gone") continue;
    kept.push(subscription);
    if (result === "ok") sent = true;
  }
  record.subscriptions = kept;
  return { record, sent };
}

export async function sendStudyReminderNow(env: StudyReminderEnv, usernameRaw: string): Promise<void> {
  const username = String(usernameRaw || "").trim().toLowerCase();
  if (!username || !(await isKnownStudent(username, env))) throw new Error("UNKNOWN_STUDENT");
  const record = await loadReminder(env, username);
  if (!record || !record.subscriptions.length) throw new Error("REMINDER_MISSING");
  const result = await deliver(env, record);
  await putReminder(env, result.record);
  if (!result.sent) throw new Error("PUSH_FAILED");
}

export async function runStudyReminders(env: StudyReminderEnv, now = new Date()): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv || !vapidKeys(env)) return;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: "hw-study-ping:", cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      let record: StudyReminderRecord;
      try {
        record = JSON.parse(raw) as StudyReminderRecord;
      } catch {
        continue;
      }
      if (!record?.enabled || !record.subscriptions?.length) continue;
      const due = isDue(record, now);
      if (!due) continue;
      try {
        const result = await deliver(env, record);
        if (result.sent) {
          result.record.lastSlot = due.slot;
          if (result.record.repeat === "once") result.record.enabled = false;
        }
        await putReminder(env, result.record);
      } catch {
        /* skip this key until the next minute */
      }
    }
  } while (cursor);
}
