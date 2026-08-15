/**
 * Site inquiry emails via Resend (https://resend.com).
 * Discord stays the primary notify path; this is a Gmail-friendly copy so JD can Reply.
 *
 * Secrets / vars:
 *   RESEND_API_KEY     — wrangler secret put RESEND_API_KEY (required to send)
 *   INQUIRY_EMAIL_TO   — default languagementor.jp@gmail.com
 *   INQUIRY_EMAIL_FROM — default "Japanese Language Mentor <inquiries@japaneselanguagementor.com>"
 *                        (must be on a Resend-verified domain, or use onboarding@resend.dev for tests)
 */

export interface InquiryEmailEnv {
  RESEND_API_KEY?: string;
  INQUIRY_EMAIL_TO?: string;
  INQUIRY_EMAIL_FROM?: string;
}

export type InquiryEmailResult =
  | { ok: true; id?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; status: number; detail: string };

const DEFAULT_TO = "languagementor.jp@gmail.com";
const DEFAULT_FROM =
  "Japanese Language Mentor <inquiries@japaneselanguagementor.com>";

export function inquiryEmailConfigured(env: InquiryEmailEnv): boolean {
  return Boolean(String(env.RESEND_API_KEY || "").trim());
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

/**
 * Send one transactional email. No-ops (skipped) when RESEND_API_KEY is unset.
 * Never throws — callers treat failure as non-fatal when Discord already delivered.
 */
export async function sendInquiryEmail(
  env: InquiryEmailEnv,
  opts: {
    subject: string;
    text: string;
    html?: string;
    /** Visitor address — Gmail Reply goes to them. */
    replyTo?: string;
  }
): Promise<InquiryEmailResult> {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    console.log(
      "inquiry-email: RESEND_API_KEY unset — Discord-only until: npx wrangler secret put RESEND_API_KEY"
    );
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
    console.error("inquiry-email: send failed", detail);
    return { ok: false, skipped: false, status: 0, detail };
  }
}
