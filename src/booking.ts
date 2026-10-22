/**
 * Free trial lesson availability, read live from JD's Google Calendar ("JLM Calendar").
 *
 *   GET  /api/booking/slots   open 60-min slots (UTC ISO starts) for the next 8 weeks (read live from the calendar)
 *
 * Rules (JD, Oct 2026): Japan time Mon/Tue/Wed/Fri (not Thu/Sat/Sun); starts 9:00-14:00 on the hour + 21:30;
 * back-to-back (no gaps); any timed busy event on the calendar blocks a slot (all-day events are reminders and don't);
 * no same-day bookings: a slot must be booked before 8 PM Japan time the day before; up to 8 weeks ahead.
 *
 * Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN (calendar.readonly).
 */

export interface BookingEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CALENDAR_REFRESH_TOKEN?: string;
  /** Defaults to languagementor.jp@gmail.com (JLM Calendar). */
  GOOGLE_CALENDAR_ID?: string;
}

const JST_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const SLOT_MIN = 60;
const DAYS_AHEAD = 56; // 8 weeks
const OPEN_WEEKDAYS = new Set([1, 2, 3, 5]); // Mon Tue Wed Fri (Japan time)
const START_TIMES_JST: [number, number][] = [
  [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], // 9:00-15:00
  [21, 30], // 9:30-10:30 PM
];
const CUTOFF_HOURS_BEFORE_DAY = 4; // 20:00 the day before = 4h before 00:00 of the slot's day
const DEFAULT_CALENDAR_ID = "languagementor.jp@gmail.com";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function configured(env: BookingEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALENDAR_REFRESH_TOKEN);
}

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(env: BookingEnv): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function calId(env: BookingEnv): string {
  return encodeURIComponent(env.GOOGLE_CALENDAR_ID || DEFAULT_CALENDAR_ID);
}

type Busy = { start: number; end: number };

/** Timed, non-cancelled, "busy" events between two instants (all-day reminders are ignored). */
async function busyBetween(env: BookingEnv, fromMs: number, toMs: number): Promise<Busy[]> {
  const token = await accessToken(env);
  const out: Busy[] = [];
  let pageToken = "";
  do {
    const qs = new URLSearchParams({
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      singleEvents: "true",
      maxResults: "250",
      fields: "nextPageToken,items(status,transparency,start,end)",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId(env)}/events?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`google events ${res.status}`);
    const data = (await res.json()) as {
      nextPageToken?: string;
      items?: { status?: string; transparency?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[];
    };
    for (const e of data.items || []) {
      if (e.status === "cancelled" || e.transparency === "transparent") continue;
      if (!e.start?.dateTime || !e.end?.dateTime) continue; // all-day = reminder, not busy
      out.push({ start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return out;
}

/** Every slot the rules allow right now, before checking the calendar. */
function candidateSlots(nowMs: number): number[] {
  const jstNow = new Date(nowMs + JST_MS);
  const todayMidnightJst = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) - JST_MS;
  const out: number[] = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const dayStartUtc = todayMidnightJst + i * DAY_MS; // 00:00 JST of that day, as a UTC instant
    const weekday = new Date(dayStartUtc + JST_MS).getUTCDay();
    if (!OPEN_WEEKDAYS.has(weekday)) continue;
    const cutoff = dayStartUtc - CUTOFF_HOURS_BEFORE_DAY * 3600 * 1000;
    if (nowMs >= cutoff) continue; // too late (same-day or after 8 PM the day before)
    for (const [h, m] of START_TIMES_JST) out.push(dayStartUtc + (h * 60 + m) * 60_000);
  }
  return out;
}

async function openSlots(env: BookingEnv, nowMs = Date.now()): Promise<number[]> {
  const cands = candidateSlots(nowMs);
  if (!cands.length) return [];
  const busy = await busyBetween(env, cands[0] - DAY_MS, cands[cands.length - 1] + 2 * DAY_MS);
  const len = SLOT_MIN * 60_000;
  return cands.filter((s) => !busy.some((b) => s < b.end && s + len > b.start));
}

export async function handleBooking(request: Request, env: BookingEnv): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  if (!configured(env)) return json({ error: "Availability is not available right now." }, 503);
  try {
    const slots = await openSlots(env);
    return json({ durationMinutes: SLOT_MIN, weeksAhead: DAYS_AHEAD / 7, slots: slots.map((s) => new Date(s).toISOString()) });
  } catch (err) {
    console.error("booking slots failed:", err);
    return json({ error: "Could not load times." }, 502);
  }
}
