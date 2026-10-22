import { notifyTeacher, type DiscordNotifyEnv } from "./discord-notify";

/**
 * Which Discord channel each kind of site ping goes to.
 *
 *  inquiries — real money inquiries (trial lesson / private lessons / Jumpstart contact form)
 *  hw        — Homework Hub: submissions, uploads, cadence reminders, signups, bug reports, birthdays
 *  video     — YouTube / Instagram scheduled-video reminders
 *  email     — email-list (promo) signups
 *  other     — everything else for JD: PayPal pings (paid / cancelled), bug reports, feature requests
 *
 * A Discord webhook only posts to the channel it was created in, so each channel needs its own.
 * They are found/created automatically and cached in KV (`discord-webhook:<channelId>`):
 *   1. cached KV webhook for the channel
 *   2. an existing secret webhook that already points at the channel
 *   3. a new webhook created with the bot token (needs "Manage Webhooks" on that channel)
 *   4. fallback: the default site webhook (old behavior) so a ping is never lost
 */

export const DISCORD_CHANNELS = {
  inquiries: "1534083802102501539",
  hw: "1507650471836258404",
  video: "1555467510281805844",
  email: "1507209734095241266",
  other: "1558004441037148210",
} as const;

export type DiscordRoute = keyof typeof DISCORD_CHANNELS;

export interface DiscordRouteEnv {
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_HOMEWORK_WEBHOOK_URL?: string;
  DISCORD_CHANNEL_ID?: string;
  DISCORD_BOT_TOKEN?: string;
}

export interface RoutedWebhook {
  url: string;
  /** Channel this webhook really posts to (use for the channel check). */
  channelId: string;
  /** False when we had to fall back to the default site webhook. */
  routed: boolean;
}

const API = "https://discord.com/api/v10";
const kvKey = (channelId: string) => `discord-webhook:${channelId}`;

/** Demo / test accounts never ping Discord. */
export function isDemoUser(username: string | null | undefined): boolean {
  const u = String(username || "")
    .trim()
    .toLowerCase();
  return u === "demo" || u.includes("demo");
}

function cleanWebhookUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url = String(raw).trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) return null;
  return url;
}

function cleanBotToken(raw: string | undefined | null): string {
  let token = String(raw || "").trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  token = token.replace(/^Bot\s+/i, "").replace(/\s+/g, "");
  if (!token || /^https?:\/\//i.test(token) || token.split(".").length < 3) return "";
  return token;
}

async function webhookChannel(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const wh = (await res.json()) as { channel_id?: string };
    return wh.channel_id ? String(wh.channel_id) : null;
  } catch {
    return null;
  }
}

async function createWebhookWithBot(
  env: DiscordRouteEnv,
  channelId: string
): Promise<{ url: string | null; error?: string }> {
  const token = cleanBotToken(env.DISCORD_BOT_TOKEN);
  if (!token) return { url: null, error: "no bot token" };
  try {
    const res = await fetch(`${API}/channels/${channelId}/webhooks`, {
      method: "POST",
      headers: {
        Authorization: "Bot " + token,
        "Content-Type": "application/json",
        "User-Agent": "JapaneseLanguageMentor-Routing/1.0",
      },
      body: JSON.stringify({ name: "JLM Site" }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text) as { message?: string };
        if (j.message) msg += " — " + j.message;
      } catch {
        /* ignore */
      }
      return { url: null, error: msg };
    }
    const j = JSON.parse(text) as { id?: string; token?: string };
    if (!j.id || !j.token) return { url: null, error: "Discord returned no webhook token" };
    return { url: `https://discord.com/api/webhooks/${j.id}/${j.token}` };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : "create failed" };
  }
}

/** Find / create the webhook for one route. Never throws. */
export async function resolveRoutedWebhookDetailed(
  env: DiscordRouteEnv,
  route: DiscordRoute
): Promise<{ result: RoutedWebhook | null; note: string }> {
  const channelId = DISCORD_CHANNELS[route];
  const kv = env.HOMEWORK_KV;

  try {
    if (kv) {
      const cached = cleanWebhookUrl(await kv.get(kvKey(channelId)));
      if (cached) return { result: { url: cached, channelId, routed: true }, note: "cached" };
    }

    for (const raw of [env.DISCORD_WEBHOOK_URL, env.DISCORD_HOMEWORK_WEBHOOK_URL]) {
      const url = cleanWebhookUrl(raw);
      if (!url) continue;
      if ((await webhookChannel(url)) === channelId) {
        if (kv) await kv.put(kvKey(channelId), url);
        return { result: { url, channelId, routed: true }, note: "existing webhook" };
      }
    }

    const created = await createWebhookWithBot(env, channelId);
    if (created.url) {
      if (kv) await kv.put(kvKey(channelId), created.url);
      return { result: { url: created.url, channelId, routed: true }, note: "created" };
    }

    const fallback = cleanWebhookUrl(env.DISCORD_WEBHOOK_URL);
    if (fallback) {
      return {
        result: {
          url: fallback,
          channelId: String(env.DISCORD_CHANNEL_ID || DISCORD_CHANNELS.inquiries),
          routed: false,
        },
        note: "fallback to default channel (" + (created.error || "no webhook") + ")",
      };
    }
    return { result: null, note: created.error || "no webhook configured" };
  } catch (err) {
    return { result: null, note: err instanceof Error ? err.message : "resolve failed" };
  }
}

export async function resolveRoutedWebhook(
  env: DiscordRouteEnv,
  route: DiscordRoute
): Promise<RoutedWebhook | null> {
  const { result, note } = await resolveRoutedWebhookDetailed(env, route);
  if (result && !result.routed) {
    console.warn(`discord route "${route}": ${note}`);
  }
  return result;
}

/**
 * Post a plain-text ping to the "other" channel (PayPal, cancellations, etc.).
 * If that channel is not set up, fall back to the old behavior (DM / default webhook).
 */
export async function notifyOther(
  env: DiscordRouteEnv & DiscordNotifyEnv,
  text: string
): Promise<void> {
  const { result } = await resolveRoutedWebhookDetailed(env, "other");
  if (result?.routed) {
    try {
      const res = await fetch(result.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: String(text || "").trim().slice(0, 1900), flags: 4 }),
      });
      if (res.ok) return;
      console.warn("notifyOther: webhook post failed", res.status);
    } catch (err) {
      console.warn("notifyOther: webhook error", err);
    }
  }
  await notifyTeacher(env, text);
}

/** Homework pings for JD go to the HW-notifications channel, not a DM. */
export async function notifyHw(env: DiscordRouteEnv, text: string): Promise<boolean> {
  const message = String(text || "").trim().slice(0, 1900);
  if (!message) return false;
  const { result, note } = await resolveRoutedWebhookDetailed(env, "hw");
  if (!result?.routed) {
    console.warn("notifyHw: HW channel not ready —", note);
    return false;
  }
  try {
    const res = await fetch(result.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, flags: 4 }),
    });
    if (!res.ok) {
      console.warn("notifyHw: webhook post failed", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("notifyHw: webhook error", err);
    return false;
  }
}