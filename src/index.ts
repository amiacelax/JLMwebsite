interface Env {
  ASSETS: Fetcher;
  DISCORD_WEBHOOK_URL?: string;
  /** website-inquiries — used to verify the webhook posts to the right channel */
  DISCORD_CHANNEL_ID?: string;
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
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function getWebhook(env: Env): string | null {
  const url = env.DISCORD_WEBHOOK_URL?.trim();
  return url || null;
}

async function getWebhookChannelMismatch(
  webhookUrl: string,
  env: Env
): Promise<string | null> {
  const expected = env.DISCORD_CHANNEL_ID?.trim();
  if (!expected) return null;

  const res = await fetch(webhookUrl);
  if (!res.ok) return "Could not verify Discord webhook configuration.";

  const wh = (await res.json()) as { channel_id?: string };
  if (wh.channel_id === expected) return null;

  return (
    "Discord webhook is not pointed at #website-inquiries. In Discord: Server Settings → " +
    "Integrations → Webhooks → edit your site webhook → set channel to website-inquiries, " +
    "or create a new webhook in that channel and run: wrangler secret put DISCORD_WEBHOOK_URL"
  );
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
          value: clip(f.value, f.name === "Message" ? 1024 : 256),
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

  const channelError = await getWebhookChannelMismatch(webhookUrl, env);
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

  const channelError = await getWebhookChannelMismatch(webhookUrl, env);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    if (url.pathname === "/api/promo-signup") {
      return handlePromoSignup(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
