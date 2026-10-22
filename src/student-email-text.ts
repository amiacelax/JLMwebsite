/**
 * Wording for the emails students get (homework updates, subscription cancelled).
 * Pure functions (no imports) so the text can be previewed without the Worker.
 *
 * All the words live in EMAIL_COPY below. To change wording, edit it there. The review page
 * (public/preview/email-review/) shows these same words and lets JD edit them in the browser.
 * Placeholders: {name} student's name, {title} homework title (shown in quotes),
 * {plan} plan name, {date} last day of the plan.
 */

export type StudentEmailKind = "assigned" | "queued" | "reviewed";

export type StudentEmailReason =
  /** No Discord ID saved, or the Discord DM did not go through. */
  | "no_discord"
  /** Student turned Email notifications on in Account Settings. */
  | "opted_in";

export interface StudentEmailInput {
  kind: StudentEmailKind;
  /** Student's first name / display name. */
  name: string;
  /** Homework title (can be empty). */
  title: string;
  /** Link that opens the homework login with the username filled in. */
  loginUrl: string;
  reason: StudentEmailReason;
}

export const EMAIL_COPY = {
  common: {
    greeting: "{name}\u3055\u3093\n\n\u304A\u75B2\u308C\u69D8\u3067\u3059\u3002",
    signoff: "\u3088\u308D\u3057\u304F\u304A\u9858\u3044\u3057\u307E\u3059\u3002\n\n\u2014 JD",
    org: "",
    /* Every "Click here" becomes a link to the Notifications page in Account Settings. */
    whyNoDiscord:
      "Want to receive these notifications via Discord instead? Click here.\nWant to turn all notifications off? Click here",
    whyOptedIn: "",
    ignore: "",
  },
  reviewed: {
    subject: "I finished reviewing your homework: {title}",
    subjectNoTitle: "JD finished reviewing your homework",
    headline: "Homework Reviewed",
    lead: "I finished reviewing your homework {title}.",
    leadNoTitle: "JD finished reviewing your homework.",
    after: "",
    button: "See JD's notes",
  },
  queued: {
    subject: "Your next homework is ready: {title}",
    subjectNoTitle: "Your next homework is ready",
    headline: "Your next homework is ready",
    lead: "I set up your next homework {title}.",
    leadNoTitle: "I set up your next homework.",
    after: "It opens as soon as you finish the one you are working on now.",
    button: "Open Homework Hub",
  },
  assigned: {
    subject: "New homework from JD: {title}",
    subjectNoTitle: "New homework from JD",
    headline: "New homework from JD",
    lead: "I just sent you new homework {title}.",
    leadNoTitle: "I just sent you new homework.",
    after: "Open the Homework Hub whenever you are ready.",
    button: "Start my homework",
  },
  cancelled: {
    subject: "Your Homework Hub subscription is cancelled",
    headline: "Your subscription is cancelled",
    lead: "Your {plan} is cancelled. You will not be charged again.",
    afterDate: "Your plan stays active until {date}.",
    afterNoDate: "Your plan stays active until the end of the period you already paid for.",
    rejoin: "Changed your mind? Log in and pick a plan any time.",
    button: "Open Homework Hub",
    why: "You are getting this email because you cancelled your subscription in your Homework Hub Account Settings. If this was not you, reply to this email.",
  },
};

export type EmailCopy = typeof EMAIL_COPY;

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fill(template: string, vars: Record<string, string>): string {
  /* A typed <p></p> means "leave a blank line here". */
  return String(template || "").replace(/<p>\s*<\/p>/gi, "\n\n").replace(/\{(\w+)\}/g, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ""
  );
}

/** Escape text and turn new lines into line breaks. */
function multiline(s: string): string {
  return esc(s).replace(/\r?\n/g, "<br>");
}

/** Footer text: new lines become line breaks, and every "Click here" becomes a link. */
function footerHtml(text: string, url: string): string {
  const link = '<a href="' + esc(url) + '" style="color:#1f6f9f;">Click here</a>';
  return multiline(text).replace(/Click here/g, link);
}

/** Where "Click here" in the footer points: the Notifications page in Account Settings. */
const DEFAULT_SETTINGS_URL = "https://japaneselanguagementor.com/homework/platform.html#account-notifications";

const HTML_OUTER =
  "background:#f4f1ea;padding:24px 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;";
const HTML_CARD =
  "max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 26px;color:#1a2744;line-height:1.55;";
const HTML_BUTTON =
  "display:inline-block;background:#1f6f9f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;";

function wrapHtml(parts: {
  headline: string;
  greeting: string;
  paragraphs: Array<{ text: string; bold?: boolean }>;
  button: string;
  loginUrl: string;
  signoff: string;
  org: string;
  footer: string;
  /** Where every "Click here" in the footer goes. */
  settingsUrl: string;
}): string {
  const shown = parts.paragraphs.filter((p) => String(p.text || "").trim());
  const paras = shown
    .map(
      (p, i) =>
        '<p style="margin:0 0 ' +
        (i === shown.length - 1 ? "22" : "12") +
        "px;" +
        (p.bold ? "font-weight:600;" : "") +
        '">' +
        esc(p.text) +
        "</p>"
    )
    .join("");
  return (
    '<div style="' + HTML_OUTER + '">' +
    '<div style="' + HTML_CARD + '">' +
    (parts.org
      ? '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5a6478;">' +
        esc(parts.org) +
        "</p>"
      : "") +
    '<h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:#1a2744;">' +
    esc(parts.headline) +
    "</h1>" +
    '<p style="margin:0 0 20px;">' + multiline(parts.greeting) + "</p>" +
    '<p style="margin:0 0 6px;"><a href="' + esc(parts.loginUrl) + '" style="' + HTML_BUTTON + '">' +
    esc(parts.button) +
    "</a></p>" +
    paras +
    '<p style="margin:0 0 ' + (parts.org ? "4" : "20") + 'px;">' + multiline(parts.signoff) + "</p>" +
    (parts.org ? '<p style="margin:0 0 20px;color:#5a6478;">' + esc(parts.org) + "</p>" : "") +
    (parts.footer.trim()
      ? '<hr style="border:none;border-top:1px solid #e3e0d8;margin:0 0 14px;">' +
        '<p style="margin:0;font-size:12.5px;line-height:1.7;color:#5a6478;">' +
        footerHtml(parts.footer, parts.settingsUrl) +
        "</p>"
      : "") +
    "</div></div>"
  );
}

export function buildStudentHomeworkEmail(
  input: StudentEmailInput,
  copy: EmailCopy = EMAIL_COPY
): {
  subject: string;
  text: string;
  html: string;
} {
  const c = copy[input.kind] || copy.assigned;
  const common = copy.common;
  const name = String(input.name || "").trim() || "there";
  const title = String(input.title || "").trim();
  const quoted = title ? "\u201C" + title + "\u201D" : "";
  const vars = { name, title: quoted };

  const subject = title ? fill(c.subject, { name, title }) : fill(c.subjectNoTitle, { name });
  const headline = fill(c.headline, vars);
  const lead = quoted ? fill(c.lead, vars) : fill(c.leadNoTitle, vars);
  const after = fill(c.after, vars);
  const greeting = fill(common.greeting, vars);
  const why = input.reason === "no_discord" ? common.whyNoDiscord : common.whyOptedIn;
  const footer = [why, common.ignore].map((s) => String(s || "").trim()).filter(Boolean).join("\n");
  const settingsUrl = DEFAULT_SETTINGS_URL;

  const signoff = fill(common.signoff, vars);
  const text =
    greeting + "\n\n" +
    input.loginUrl + "\n\n" +
    [lead, after].filter((s) => s.trim()).join("\n") + "\n\n" +
    [signoff, common.org].filter(Boolean).join("\n") + "\n" +
    (footer ? "\n" + footer.replace(/Click here/g, "Click here (" + settingsUrl + ")") + "\n" : "");

  const html = wrapHtml({
    headline,
    greeting,
    paragraphs: [{ text: lead }, { text: after }],
    button: c.button,
    loginUrl: input.loginUrl,
    signoff,
    org: common.org,
    footer,
    settingsUrl,
  });

  return { subject, text, html };
}

export interface CancellationEmailInput {
  name: string;
  /** "Premium", "Basic", "Ultra", etc. */
  planName: string;
  /** Date text like "March 14, 2027". Empty when it is not known yet. */
  endsOn: string;
  loginUrl: string;
}

/** Confirmation sent right after a student cancels their subscription. */
export function buildCancellationEmail(
  input: CancellationEmailInput,
  copy: EmailCopy = EMAIL_COPY
): {
  subject: string;
  text: string;
  html: string;
} {
  const c = copy.cancelled;
  const common = copy.common;
  const name = String(input.name || "").trim() || "there";
  const plan = String(input.planName || "").trim();
  const endsOn = String(input.endsOn || "").trim();
  const vars = { name, plan: plan ? plan + " plan" : "plan", date: endsOn };

  const lead = fill(c.lead, vars);
  const after = endsOn ? fill(c.afterDate, vars) : fill(c.afterNoDate, vars);
  const rejoin = fill(c.rejoin, vars);
  const greeting = fill(common.greeting, vars);

  const text =
    greeting + "\n\n" +
    lead + "\n" +
    after + "\n" +
    rejoin + "\n\n" +
    input.loginUrl + "\n\n" +
    [fill(common.signoff, vars), common.org].filter(Boolean).join("\n") + "\n\n" +
    c.why + "\n";

  const html = wrapHtml({
    headline: fill(c.headline, vars),
    greeting,
    paragraphs: [{ text: lead }, { text: after, bold: true }, { text: rejoin }],
    button: c.button,
    loginUrl: input.loginUrl,
    signoff: fill(common.signoff, vars),
    org: common.org,
    footer: c.why,
    settingsUrl: DEFAULT_SETTINGS_URL,
  });

  return { subject: fill(c.subject, vars), text, html };
}
