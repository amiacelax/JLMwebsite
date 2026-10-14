/**
 * Site inquiry emails.
 * Primary: Cloudflare Email Routing (send_email binding) → Gmail.
 * Fallback: Resend API if RESEND_API_KEY is set.
 * Discord stays the other notify path.
 */

export interface InquiryEmailEnv {
  RESEND_API_KEY?: string;
  INQUIRY_EMAIL_TO?: string;
  INQUIRY_EMAIL_FROM?: string;
  ACCOUNT_EMAIL_FROM?: string;
  SEND_EMAIL?: {
    send: (message: unknown) => Promise<unknown>;
  };
  SEND_EMAIL_OUT?: {
    send: (message: unknown) => Promise<unknown>;
  };
}

export type InquiryEmailResult =
  | { ok: true; id?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; status: number; detail: string };

const DEFAULT_TO = "languagementor.jp@gmail.com";
const DEFAULT_FROM =
  "Japanese Language Mentor <inquiries@japaneselanguagementor.com>";
const DEFAULT_ACCOUNT_FROM =
  "Japanese Language Mentor <JD@japaneselanguagementor.com>";

function fromAddress(fromHeader: string): string {
  const m = String(fromHeader || "").match(/<([^>]+)>/);
  return (m ? m[1] : fromHeader).trim() || "inquiries@japaneselanguagementor.com";
}

export function inquiryEmailConfigured(env: InquiryEmailEnv): boolean {
  return Boolean(env.SEND_EMAIL?.send) || Boolean(String(env.RESEND_API_KEY || "").trim());
}

export function outboundEmailConfigured(env: InquiryEmailEnv): boolean {
  return (
    Boolean(env.SEND_EMAIL_OUT?.send) ||
    Boolean(env.SEND_EMAIL?.send) ||
    Boolean(String(env.RESEND_API_KEY || "").trim())
  );
}

function clip(text: string, max: number): string {
  const t = String(text || "");
  return t.length <= max ? t : t.slice(0, max) + "…";
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeHeader(value: string): string {
  const v = String(value || "").replace(/\r|\n/g, " ");
  if (/^[\x20-\x7E]*$/.test(v)) return v;
  const bytes = new TextEncoder().encode(v);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return "=?UTF-8?B?" + btoa(bin) + "?=";
}

function buildRawEmail(opts: {
  fromHeader: string;
  fromAddr: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
}): string {
  const lines = [
    "From: " + opts.fromHeader,
    "To: " + opts.to,
    "Subject: " + encodeHeader(opts.subject),
    "MIME-Version: 1.0",
  ];
  if (opts.replyTo) lines.push("Reply-To: " + opts.replyTo);

  const text = String(opts.text || "").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const html = opts.html
    ? String(opts.html).replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
    : "";

  if (html) {
    const boundary = "jlm" + Date.now().toString(36);
    lines.push("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"", "");
    lines.push(
      "--" + boundary,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      "--" + boundary,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      "--" + boundary + "--",
      ""
    );
  } else {
    lines.push(
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text
    );
  }
  return lines.join("\r\n");
}

/** Plain + simple HTML body from labeled lines. */
export function formatInquiryEmailBody(
  lines: Array<{ label: string; value: string }>
): { text: string; html: string } {
  const text = lines.map((l) => `${l.label}: ${l.value}`).join("\n");
  const html =
    `<div style="font-family:system-ui,sans-serif;line-height:1.5">` +
    lines
      .map(
        (l) =>
          `<p style="margin:0 0 12px"><strong>${escapeHtml(l.label)}:</strong><br>` +
          `${escapeHtml(l.value).replace(/\n/g, "<br>")}</p>`
      )
      .join("") +
    `<p style="margin:16px 0 0;color:#666;font-size:13px">Sent from japaneselanguagementor.com</p>` +
    `</div>`;
  return { text, html };
}

async function sendViaCloudflare(
  env: InquiryEmailEnv,
  opts: { subject: string; text: string; html?: string; replyTo?: string }
): Promise<InquiryEmailResult> {
  if (!env.SEND_EMAIL?.send) {
    return { ok: false, skipped: true, reason: "SEND_EMAIL unset" };
  }

  const to = String(env.INQUIRY_EMAIL_TO || DEFAULT_TO).trim() || DEFAULT_TO;
  const fromHeader = String(env.INQUIRY_EMAIL_FROM || DEFAULT_FROM).trim() || DEFAULT_FROM;
  const fromAddr = fromAddress(fromHeader);
  const replyTo = String(opts.replyTo || "").trim();
  const raw = buildRawEmail({
    fromHeader,
    fromAddr,
    to,
    replyTo: replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) ? replyTo : undefined,
    subject: clip(opts.subject, 200),
    text: opts.text,
    html: opts.html,
  });

  try {
    const { EmailMessage } = (await import("cloudflare:email")) as {
      EmailMessage: new (from: string, to: string, raw: string) => unknown;
    };
    await env.SEND_EMAIL.send(new EmailMessage(fromAddr, to, raw));
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "cloudflare email send failed";
    console.error("inquiry-email: Cloudflare Email Routing send failed", detail);
    return { ok: false, skipped: false, status: 0, detail: clip(detail, 400) };
  }
}

async function sendViaResend(
  env: InquiryEmailEnv,
  opts: { subject: string; text: string; html?: string; replyTo?: string }
): Promise<InquiryEmailResult> {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY unset" };
  }

  const to = String(env.INQUIRY_EMAIL_TO || DEFAULT_TO).trim() || DEFAULT_TO;
  const from = String(env.INQUIRY_EMAIL_FROM || DEFAULT_FROM).trim() || DEFAULT_FROM;
  const replyTo = String(opts.replyTo || "").trim();

  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject: clip(opts.subject, 200),
    text: opts.text,
  };
  if (opts.html) body.html = opts.html;
  if (replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    body.reply_to = replyTo;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = clip(await res.text(), 400);
      console.error("inquiry-email: Resend error", res.status, detail);
      return { ok: false, skipped: false, status: res.status, detail };
    }

    let id: string | undefined;
    try {
      const data = (await res.json()) as { id?: string };
      id = data.id;
    } catch {
      /* ignore */
    }
    return { ok: true, id };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "fetch failed";
    console.error("inquiry-email: Resend send failed", detail);
    return { ok: false, skipped: false, status: 0, detail };
  }
}

/**
 * Send one transactional email. Cloudflare Email Routing first, then Resend.
 * Never throws — callers treat failure as non-fatal when Discord already delivered.
 */
export async function sendInquiryEmail(
  env: InquiryEmailEnv,
  opts: {
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
  }
): Promise<InquiryEmailResult> {
  const cf = await sendViaCloudflare(env, opts);
  if (cf.ok) return cf;
  if (!cf.skipped) {
    const resendAfterCf = await sendViaResend(env, opts);
    if (resendAfterCf.ok) return resendAfterCf;
    return cf;
  }
  return sendViaResend(env, opts);
}

async function sendViaBinding(
  binding: { send: (message: unknown) => Promise<unknown> } | undefined,
  opts: {
    fromHeader: string;
    fromAddr: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }
): Promise<InquiryEmailResult> {
  if (!binding?.send) {
    return { ok: false, skipped: true, reason: "binding unset" };
  }

  try {
    const structured = await binding.send({
      to: opts.to,
      from: opts.fromHeader,
      subject: clip(opts.subject, 200),
      text: opts.text,
      html: opts.html,
    });
    if (
      structured &&
      typeof structured === "object" &&
      "success" in structured &&
      (structured as { success?: boolean }).success === false
    ) {
      throw new Error("email send returned success:false");
    }
    return { ok: true };
  } catch (structuredErr) {
    try {
      const { EmailMessage } = (await import("cloudflare:email")) as {
        EmailMessage: new (from: string, to: string, raw: string) => unknown;
      };
      const raw = buildRawEmail({
        fromHeader: opts.fromHeader,
        fromAddr: opts.fromAddr,
        to: opts.to,
        subject: clip(opts.subject, 200),
        text: opts.text,
        html: opts.html,
      });
      await binding.send(new EmailMessage(opts.fromAddr, opts.to, raw));
      return { ok: true };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(structuredErr);
      console.error("outbound-email: Cloudflare send failed", detail);
      return { ok: false, skipped: false, status: 0, detail: clip(detail, 400) };
    }
  }
}

async function sendViaResendTo(
  env: InquiryEmailEnv,
  opts: {
    to: string;
    fromHeader: string;
    subject: string;
    text: string;
    html?: string;
  }
): Promise<InquiryEmailResult> {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY unset" };
  }

  const body: Record<string, unknown> = {
    from: opts.fromHeader,
    to: [opts.to],
    subject: clip(opts.subject, 200),
    text: opts.text,
  };
  if (opts.html) body.html = opts.html;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = clip(await res.text(), 400);
      console.error("outbound-email: Resend error", res.status, detail);
      return { ok: false, skipped: false, status: res.status, detail };
    }
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "fetch failed";
    console.error("outbound-email: Resend send failed", detail);
    return { ok: false, skipped: false, status: 0, detail };
  }
}

/**
 * Send mail to a student (password reset, etc).
 * Prefer unrestricted SEND_EMAIL_OUT (Email Sending), then Resend.
 */
export async function sendOutboundEmail(
  env: InquiryEmailEnv,
  opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    fromHeader?: string;
  }
): Promise<InquiryEmailResult> {
  const to = String(opts.to || "").trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, skipped: false, status: 400, detail: "invalid to" };
  }
  const fromHeader =
    String(opts.fromHeader || env.ACCOUNT_EMAIL_FROM || DEFAULT_ACCOUNT_FROM).trim() ||
    DEFAULT_ACCOUNT_FROM;
  const fromAddr = fromAddress(fromHeader);
  const payload = {
    fromHeader,
    fromAddr,
    to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  };

  const out = await sendViaBinding(env.SEND_EMAIL_OUT, payload);
  if (out.ok) return out;
  if (!out.skipped) {
    const resendAfter = await sendViaResendTo(env, payload);
    if (resendAfter.ok) return resendAfter;
    return out;
  }
  return sendViaResendTo(env, payload);
}
