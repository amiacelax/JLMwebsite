import { runBirthdayReminders } from "./birthday-reminders";
import {
  armSocialReminder,
  assertTeacherArm,
  cancelSocialReminder,
  listPendingSocialReminders,
  runSocialReminders,
  type SocialReminderArmPayload,
} from "./social-reminders";
import {
  armHwPlanReminder,
  clearHwPlanReminder,
  mapCheckoutPlanToTier,
  planLabelFromTier,
  runHwPlanReminders,
} from "./hw-plan-reminders";
import {
  buildCancelReturnUrl,
  buildPaidReturnUrl,
  createPaypalSubscription,
  normalizeHwCheckoutPlan,
  paypalCredentialsConfigured,
} from "./paypal-subscriptions";
import {
  isHarrisPreviewAuthorized,
  isHarrisPreviewPath,
  harrisPreviewUnauthorized,
  withHarrisPreviewHeaders,
} from "./harris-preview-auth";
import {
  isJemPreviewPath,
  withJemPreviewHeaders,
} from "./jem-preview-auth";
import {
  daysUntilBirthday,
  formatBirthdayLabel,
  listStudentBirthdaysSorted,
} from "./student-birthdays";
import {
  generateHomeworkWithAi,
  type HomeworkGenerateRequest,
} from "./homework-generate";
import {
  getDiscordBotStatus,
  notifyStudentWithTeacherFallback,
  type DiscordNotifyResult,
} from "./discord-notify";
import {
  formatInquiryEmailBody,
  inquiryEmailConfigured,
  sendInquiryEmail,
} from "./notify-email";
import {
  mergeCatalog,
  publishToStudentHub,
  saveStudentProfile,
  getStudentProfileForTeacher,
  getStudentDiscordUserId,
  saveStudentDiscordUserId,
  getStudentNotifyPrefs,
  saveStudentNotifyPrefs,
  normalizeNotifyPrefs,
  saveWorksheetDraft,
  deleteWorksheetFromLibrary,
  loadPublishedAssignment,
  listTeacherIdeas,
  listTeacherIdeaTags,
  saveTeacherIdea,
  deleteTeacherIdea,
  addTeacherIdeaTag,
  deleteTeacherIdeaTag,
  deleteTeacherIdeaImage,
  listCustomTeacherIdeaTags,
  uploadTeacherIdeaImage,
  saveWorksheetPromptImage,
  saveStudentWorksheetImage,
  loadWorksheetPromptImage,
  loadTeacherIdeaImage,
  type CatalogFile,
  type PublishPayload,
  type StudentProfilePayload,
  type SaveWorksheetPayload,
  type DeleteWorksheetPayload,
  type TeacherIdeaPayload,
  type TeacherIdeaDeletePayload,
  type TeacherIdeaTagPayload,
  type TeacherIdeaImageDeletePayload,
  saveHomeworkOnlineSubmission,
  saveHomeworkPhotoSubmission,
  saveHomeworkVideoSubmission,
  listHomeworkSubmissions,
  getHomeworkSubmission,
  saveHomeworkReview,
  readAnswerBank,
  saveHomeworkReviewAck,
  listHomeworkNotebook,
  loadHomeworkSubmissionPhoto,
  loadHomeworkSubmissionVideo,
  saveHomeworkReviewMedia,
  loadHomeworkDraft,
  saveHomeworkDraft,
  deleteHomeworkDraft,
  getDailyNotebook,
  saveDailyNotebook,
  type DailyNotebookSaveInput,
  getKanjiNotebook,
  saveKanjiNotebook,
  type KanjiNotebookSaveInput,
  loadHomeworkCommentsDraft,
  saveHomeworkCommentsDraft,
  deleteHomeworkCommentsDraft,
  type HomeworkDraftSaveInput,
  type HomeworkCommentsDraftSaveInput,
  type HomeworkComment,
  savePromoSignup,
  listPromoSignups,
  savePromoSignupTeacher,
  saveFeatureReport,
  listFeatureReports,
  loadFeatureReportImage,
  deletePromoSignup,
  type PromoSignupSavePayload,
  type PromoSignupDeletePayload,
  type HomeworkOnlineSubmitInput,
  type HomeworkPhotoSubmitInput,
  type HomeworkVideoSubmitInput,
  type HomeworkReviewSaveInput,
  type HomeworkReviewAckInput,
  listStudentMistakes,
  saveStudentMistake,
  deleteStudentMistake,
  resolveStudentMistake,
  restoreStudentMistake,
  isKnownStudent,
  isTeacherMistakesAccess,
  listAllStudentAccounts,
  wipeStudentCompletely,
  type StudentMistakePayload,
  type StudentMistakeDeletePayload,
  type StudentMistakeResolvePayload,
  listLanternWordSets,
  loadLanternWords,
  saveLanternWords,
  deleteLanternWordSet,
  type LanternWordSetSavePayload,
  type LanternWordSetDeletePayload,
} from "./homework-kv";
import {
  changeOwnPassword,
  createUserAccount,
  deleteOwnAccount,
  deleteUserAccount,
  getUserAccount,
  loginUserAccount,
  savePaypalSubscription,
  toAuthSession,
  updateOwnDisplayName,
  updateUserAccountSettings,
  type SignupInput,
  type LoginInput,
} from "./user-accounts";
import {
  getMgLexiconPublic,
  getMgLexiconQueue,
  submitMgLexiconCard,
  addMgLexiconCard,
  patchMgLexiconOverlay,
  suggestMgLexiconBatch,
  suggestMgLexiconFromAssignment,
  getMgGlassCheck,
  setMgGlassCheck,
  type MgLexiconSubmitPayload,
  type MgLexiconAddCardPayload,
  type MgLexiconPatchPayload,
  type MgLexiconSuggestBatchPayload,
  type MgGlassCheckPayload,
} from "./mg-lexicon-kv";

interface Env {
  ASSETS: Fetcher;
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  /** Discord notify channel — used to verify the webhook posts to the right place */
  DISCORD_CHANNEL_ID?: string;
  DISCORD_HOMEWORK_WEBHOOK_URL?: string;
  DISCORD_HOMEWORK_CHANNEL_ID?: string;
  /** Bot token for student/teacher DMs (secret). */
  DISCORD_BOT_TOKEN?: string;
  /** JD Discord snowflake — fallback when student has no Discord linked. */
  DISCORD_TEACHER_USER_ID?: string;
  OPENAI_API_KEY?: string;
  HW_TEACHER_USER?: string;
  MISTAKES_LOG_KEY?: string;
  /** Set to 1 in .dev.vars so localhost can auto-load the mistakes log key */
  LOCAL_DEV?: string;
  /** PayPal REST app — needed for subscription approve links with return_url */
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  /** "live" (default) or "sandbox" */
  PAYPAL_MODE?: string;
  HARRIS_PREVIEW_USER?: string;
  HARRIS_PREVIEW_PASSWORD?: string;
  JEM_PREVIEW_USER?: string;
  JEM_PREVIEW_PASSWORD?: string;
  /** Resend API key — contact/promo Gmail copies (optional until set). */
  RESEND_API_KEY?: string;
  /** Inbox for website inquiries (default: languagementor.jp@gmail.com). */
  INQUIRY_EMAIL_TO?: string;
  /** From address — must be on a Resend-verified domain. */
  INQUIRY_EMAIL_FROM?: string;
}

interface HomeworkAnswerRow {
  label?: string;
  prompt?: string;
  student?: string;
  expected?: string;
  correct?: boolean;
  /** Full sentence with the student's blank filled in */
  completed?: string;
  /** Prompt line shown to the student (e.g. Japanese for translation). */
  question?: string;
  /** Teacher reference for listening clips. */
  reference?: string;
  /** Star-order fixed prefix/suffix display (e.g. 子ども · 悲しい). */
  staticDisplay?: string;
  prefix?: string;
  suffix?: string;
  /** Star-order pieces joined for reference. */
  piecesDisplay?: string;
  /** Star-order slot fill order as JSON array string. */
  slotOrder?: string;
  mediaId?: string;
  mediaKind?: "video" | "audio";
}

interface HomeworkOrderedAnswerRow extends HomeworkAnswerRow {
  progress?: string;
  blockType?: string;
}

interface HomeworkSubmitPayload {
  username?: string;
  displayName?: string;
  assignmentId?: string;
  lessonName?: string;
  title?: string;
  register?: string;
  scoreCorrect?: number;
  scoreTotal?: number;
  section1?: HomeworkAnswerRow[];
  section2?: HomeworkAnswerRow[];
  listening?: HomeworkAnswerRow[];
  /** Worksheet-order answers with block progress (preferred for Discord). */
  answers?: HomeworkOrderedAnswerRow[];
  comments?: HomeworkComment[];
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
  interests?: string[];
  interestOther?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

function isLocalDevRequest(request: Request, env: Env): boolean {
  if (String(env.LOCAL_DEV || "").trim() !== "1") return false;
  const host = (request.headers.get("Host") || "").split(":")[0].toLowerCase();
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return host === "127.0.0.1" || host === "localhost";
  }
}

async function handleLocalDevMistakesKey(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!isLocalDevRequest(request, env)) {
    return jsonResponse({ error: "Not available." }, 404);
  }
  const key = String(env.MISTAKES_LOG_KEY || "").trim();
  if (!key) {
    return jsonResponse({ error: "Add MISTAKES_LOG_KEY to .dev.vars" }, 503);
  }
  return jsonResponse({ key });
}

function clip(value: string, max: number): string {
  const s = String(value ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function getWebhook(env: Env): string | null {
  return sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
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
    console.error("Invalid Discord webhook URL (must be https://discord.com/api/webhooks/...)");
    return null;
  }
  return url;
}

type ResolvedHomeworkWebhook = {
  url: string;
  channelId?: string;
  /** True when homework webhook secret is missing and site webhook is used */
  usedFallback: boolean;
};

function resolveHomeworkWebhook(env: Env): ResolvedHomeworkWebhook | null {
  const homeworkUrl = sanitizeWebhookUrl(env.DISCORD_HOMEWORK_WEBHOOK_URL);
  if (homeworkUrl) {
    return {
      url: homeworkUrl,
      channelId: env.DISCORD_HOMEWORK_CHANNEL_ID,
      usedFallback: false,
    };
  }
  const siteUrl = sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
  if (siteUrl) {
    return {
      url: siteUrl,
      channelId: env.DISCORD_CHANNEL_ID,
      usedFallback: true,
    };
  }
  return null;
}

async function getWebhookChannelMismatch(
  webhookUrl: string,
  expectedChannelId: string | undefined,
  channelLabel: string
): Promise<string | null> {
  const expected = expectedChannelId?.trim();
  if (!expected) return null;

  const res = await fetch(webhookUrl);
  if (!res.ok) return "Could not verify Discord webhook configuration.";

  const wh = (await res.json()) as { channel_id?: string };
  if (wh.channel_id === expected) return null;

  return (
    `Discord webhook is not pointed at ${channelLabel} (expected channel ${expected}). ` +
    "Create or edit a webhook in that channel and update the matching wrangler secret."
  );
}

/** Wrap plain Discord text in a code block (monospace “code text” look). */
function wrapDiscordCodeBlock(text: string): string {
  const body = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/```/g, "'''")
    .trim();
  // Reserve room for fences: ```\n ... \n```
  const clipped = clip(body, 1980);
  return "```\n" + clipped + "\n```";
}

function fieldMaxLen(fieldName: string): number {
  if (fieldName === "Message" || fieldName.startsWith("Section ")) return 1800;
  return 500;
}

/** Plain Discord text: title, then one Label: value per line (no embed / no timestamp). */
function formatDiscordPlainLines(
  title: string,
  fields: { name: string; value: string }[]
): string {
  const lines = [title.trim()];
  for (const f of fields) {
    const name = String(f.name || "").trim();
    const value = String(f.value ?? "").trim();
    if (!name && !value) continue;
    if (!name) {
      lines.push(value);
      continue;
    }
    const valueLines = value.split(/\r?\n/);
    lines.push(`${name}: ${valueLines[0] || ""}`);
    for (let i = 1; i < valueLines.length; i++) {
      lines.push(valueLines[i]);
    }
  }
  return lines.join("\n").trim();
}

async function notifyDiscord(
  webhookUrl: string,
  payload: {
    title: string;
    color?: number;
    fields: { name: string; value: string; inline?: boolean }[];
  }
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const fields = payload.fields.map((f) => ({
    name: f.name,
    value: clip(f.value, fieldMaxLen(f.name)),
  }));
  const content = wrapDiscordCodeBlock(formatDiscordPlainLines(payload.title, fields));

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (res.ok) return { ok: true };

  const detail = await res.text();
  return { ok: false, status: res.status, detail: clip(detail, 200) };
}

function validateContact(data: ContactPayload): string | null {
  if (!data.name?.trim()) return "Name is required.";
  if (!data.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return "A valid email is required.";
  if (!data.service?.trim()) return "Service is required.";
  if (!data.message?.trim() || data.message.trim().length < 10)
    return "Message must be at least 10 characters.";
  return null;
}

function validatePromoEmail(data: PromoPayload): string | null {
  if (!data.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return "A valid email is required.";
  const interests = Array.isArray(data.interests)
    ? data.interests.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const allowed = new Set(["lesson-discounts", "new-learning-games", "other"]);
  if (interests.some((v) => !allowed.has(v))) {
    return "Pick a valid interest option.";
  }
  if (interests.includes("other")) {
    const other = String(data.interestOther || "").trim();
    if (other.length < 3) {
      return "Please say a bit more for Other (at least 3 characters).";
    }
  }
  return null;
}

function formatPromoInterestLabel(key: string): string {
  if (key === "lesson-discounts") return "Lesson discounts";
  if (key === "new-learning-games") return "New learning games";
  if (key === "other") return "Other";
  return key;
}

function formatPromoInterestsForDiscord(
  interests: string[] | undefined,
  interestOther: string | undefined
): string {
  const keys = Array.isArray(interests) ? interests : [];
  if (!keys.length) return "Not specified";
  return keys
    .map((k) => {
      if (k === "other") {
        const note = String(interestOther || "").trim();
        return note ? `Other: ${note}` : "Other";
      }
      return formatPromoInterestLabel(k);
    })
    .join("\n");
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
  const canEmail = inquiryEmailConfigured(env);
  if (!webhookUrl && !canEmail) {
    return jsonResponse(
      {
        error:
          "Contact notifications are not configured yet. Please try again later.",
      },
      503
    );
  }

  let discordAllowed = Boolean(webhookUrl);
  if (webhookUrl) {
    const channelError = await getWebhookChannelMismatch(
      webhookUrl,
      env.DISCORD_CHANNEL_ID,
      "Discord notify channel"
    );
    if (channelError) {
      console.error(channelError);
      discordAllowed = false;
      if (!canEmail) {
        return jsonResponse(
          {
            error:
              "Contact notifications are misconfigured. Please try again later or email us directly.",
          },
          503
        );
      }
    }
  }

  const name = data.name!.trim();
  const email = data.email!.trim();
  const service = data.service?.trim() || "General inquiry";
  const message = data.message!.trim();

  const emailBody = formatInquiryEmailBody([
    { label: "Name", value: name },
    { label: "Email", value: email },
    { label: "Service", value: service },
    { label: "Message", value: message },
  ]);

  const [discordResult, emailResult] = await Promise.all([
    discordAllowed && webhookUrl
      ? notifyDiscord(webhookUrl, {
          title: "Website inquiries — new message",
          color: 0xe74c3c,
          fields: [
            { name: "Name", value: name, inline: true },
            { name: "Email", value: email, inline: true },
            { name: "Service", value: service, inline: true },
            { name: "Message", value: message },
          ],
        })
      : Promise.resolve({ ok: false as const, status: 0, detail: "discord skipped" }),
    sendInquiryEmail(env, {
      subject: `Website inquiry from ${name} — ${service}`,
      text: emailBody.text,
      html: emailBody.html,
      replyTo: email,
    }),
  ]);

  if (!discordResult.ok && !emailResult.ok) {
    return jsonResponse(
      { error: "Could not deliver your message. Please try again in a few minutes." },
      502
    );
  }

  if (!emailResult.ok && !("skipped" in emailResult && emailResult.skipped)) {
    console.error("contact: email copy failed", emailResult);
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
  const canEmail = inquiryEmailConfigured(env);
  if (!webhookUrl && !canEmail) {
    return jsonResponse(
      { error: "Sign-ups are not configured yet. Please try again later." },
      503
    );
  }

  let discordAllowed = Boolean(webhookUrl);
  if (webhookUrl) {
    const channelError = await getWebhookChannelMismatch(
      webhookUrl,
      env.DISCORD_CHANNEL_ID,
      "Discord notify channel"
    );
    if (channelError) {
      console.error(channelError);
      discordAllowed = false;
      if (!canEmail) {
        return jsonResponse(
          { error: "Sign-ups are misconfigured. Please try again later." },
          503
        );
      }
    }
  }

  const page = data.page?.trim() || "Unknown page";
  const email = data.email!.trim();
  const interests = Array.isArray(data.interests)
    ? data.interests.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const interestOther = String(data.interestOther || "").trim();
  const interestsLabel = formatPromoInterestsForDiscord(interests, interestOther);

  let kvSaved = false;
  let duplicate = false;
  try {
    const saved = await savePromoSignup(
      { email, page, interests, interestOther },
      env
    );
    kvSaved = true;
    duplicate = saved.duplicate;
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code !== "KV_NOT_CONFIGURED") {
      console.error("promo-signup KV save failed:", err);
    }
  }

  const emailBody = formatInquiryEmailBody([
    { label: "Email", value: email },
    { label: "Page", value: page },
    { label: "Interests", value: interestsLabel },
    { label: "Type", value: "Limited promotions & discounts list" },
    ...(kvSaved
      ? [{ label: "Stored in hub", value: duplicate ? "Already on list" : "Yes" }]
      : []),
  ]);

  const [discordResult, emailResult] = await Promise.all([
    discordAllowed && webhookUrl
      ? notifyDiscord(webhookUrl, {
          title: duplicate
            ? "Website inquiries — promo email signup (duplicate)"
            : "Website inquiries — promo email signup",
          color: 0x67c4eb,
          fields: [
            { name: "Email", value: email, inline: true },
            { name: "Page", value: page, inline: true },
            { name: "Interests", value: interestsLabel, inline: false },
            {
              name: "Type",
              value: "Limited promotions & discounts list",
              inline: true,
            },
            ...(kvSaved
              ? [
                  {
                    name: "Stored in hub",
                    value: duplicate ? "Already on list" : "Yes",
                    inline: true,
                  },
                ]
              : []),
          ],
        })
      : Promise.resolve({ ok: false as const, status: 0, detail: "discord skipped" }),
    sendInquiryEmail(env, {
      subject: duplicate
        ? `Promo signup (duplicate) — ${email}`
        : `Promo signup — ${email}`,
      text: emailBody.text,
      html: emailBody.html,
      replyTo: email,
    }),
  ]);

  if (!kvSaved && !discordResult.ok && !emailResult.ok) {
    return jsonResponse(
      { error: "Could not save your email. Please try again in a few minutes." },
      502
    );
  }

  if (!emailResult.ok && !("skipped" in emailResult && emailResult.skipped)) {
    console.error("promo-signup: email copy failed", emailResult);
  }

  return jsonResponse({
    success: true,
    message: "You're on the list! Watch your inbox for updates.",
  });
}

async function handleFeatureReport(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let data: {
    kind?: string;
    message?: string;
    username?: string;
    displayName?: string;
    page?: string;
    imageBase64?: string;
  };
  try {
    data = (await request.json()) as typeof data;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  try {
    const report = await saveFeatureReport(data, env);

    const webhookUrl = getWebhook(env);
    if (webhookUrl && (report.kind === "bug" || report.kind === "feature")) {
      const channelError = await getWebhookChannelMismatch(
        webhookUrl,
        env.DISCORD_CHANNEL_ID,
        "Discord notify channel"
      );
      if (channelError) {
        console.error("feature-report discord:", channelError);
      } else {
        const who =
          report.displayName || report.username || "A student";
        const title =
          report.kind === "bug"
            ? "Website inquiries — bug report"
            : "Website inquiries — feature request";
        const lines = [
          title,
          `From: ${who}`,
          report.username ? `Username: ${report.username}` : "",
          report.page ? `Page: ${report.page}` : "",
          "",
          report.message,
        ]
          .filter(Boolean)
          .join("\n");

        if (report.hasImage) {
          try {
            const img = await loadFeatureReportImage(report.id, env);
            if (img) {
              const ext =
                img.contentType.includes("png")
                  ? "png"
                  : img.contentType.includes("webp")
                    ? "webp"
                    : "jpg";
              const file = new File([img.bytes], `bug-${report.id}.${ext}`, {
                type: img.contentType,
              });
              const discordResult = await notifyHomeworkDiscordWithFile(
                webhookUrl,
                lines,
                file
              );
              if (!discordResult.ok) {
                console.error(
                  "feature-report discord file failed:",
                  discordResult.status,
                  discordResult.detail
                );
              }
            } else {
              await notifyDiscord(webhookUrl, {
                title,
                color: report.kind === "bug" ? 0xe74c3c : 0x3498db,
                fields: [
                  { name: "From", value: who, inline: true },
                  {
                    name: "Message",
                    value: report.message.slice(0, 1000),
                  },
                ],
              });
            }
          } catch (err) {
            console.error("feature-report discord image:", err);
          }
        } else {
          const discordResult = await notifyDiscord(webhookUrl, {
            title,
            color: report.kind === "bug" ? 0xe74c3c : 0x3498db,
            fields: [
              { name: "From", value: who, inline: true },
              ...(report.username
                ? [{ name: "Username", value: report.username, inline: true }]
                : []),
              {
                name: "Message",
                value: report.message.slice(0, 1000),
              },
            ],
          });
          if (!discordResult.ok) {
            console.error(
              "feature-report discord post failed:",
              discordResult.status,
              discordResult.detail
            );
          }
        }
      }
    }

    return jsonResponse({
      success: true,
      message: "Sent to JD — thanks!",
      id: report.id,
      hasImage: Boolean(report.hasImage),
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Reports are not configured on this server yet." }, 503);
    }
    if (code === "KIND_REQUIRED") {
      return jsonResponse({ error: "Choose Feature request, Bug report, or reminder." }, 400);
    }
    if (code === "MESSAGE_REQUIRED") {
      return jsonResponse({ error: "Write a short message before sending." }, 400);
    }
    if (code === "MESSAGE_TOO_LONG") {
      return jsonResponse({ error: "Message is too long (max about 4000 characters)." }, 400);
    }
    if (code === "IMAGE_TOO_LARGE") {
      return jsonResponse({ error: "Screenshot is too large. Try again." }, 400);
    }
    if (code === "IMAGE_INVALID") {
      return jsonResponse({ error: "Could not read the screenshot." }, 400);
    }
    console.error("feature-report failed:", err);
    return jsonResponse({ error: "Could not send your report. Try again in a moment." }, 500);
  }
}

async function handleFeatureReportImage(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return jsonResponse({ error: "Report id is required." }, 400);

  try {
    const img = await loadFeatureReportImage(id, env);
    if (!img) return jsonResponse({ error: "Screenshot not found." }, 404);
    return new Response(img.bytes, {
      status: 200,
      headers: {
        "Content-Type": img.contentType,
        "Cache-Control": "private, max-age=3600",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Report storage is not configured on this server." }, 503);
    }
    console.error("feature-report-image failed:", err);
    return jsonResponse({ error: "Could not load screenshot." }, 500);
  }
}

async function attachSessionExtras(
  session: { username: string; [key: string]: unknown },
  env: Env
) {
  const kv = env.HOMEWORK_KV;
  if (!kv || !session?.username) {
    return {
      ...session,
      discordUserId: "",
      notifyPrefs: normalizeNotifyPrefs(null),
    };
  }
  const discordUserId = await getStudentDiscordUserId(kv, session.username);
  const notifyPrefs = await getStudentNotifyPrefs(kv, session.username);
  return { ...session, discordUserId, notifyPrefs };
}

async function handleAuthSelfExtras(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as { username?: string; notifyPrefs?: unknown };
    const username = String(data.username || "")
      .trim()
      .toLowerCase();
    if (!username) return jsonResponse({ error: "Username is required." }, 400);
    const kv = env.HOMEWORK_KV;
    if (!kv) throw new Error("KV_NOT_CONFIGURED");
    if (data.notifyPrefs) {
      await saveStudentNotifyPrefs(kv, username, normalizeNotifyPrefs(data.notifyPrefs));
    }
    const discordUserId = await getStudentDiscordUserId(kv, username);
    const notifyPrefs = await getStudentNotifyPrefs(kv, username);
    return jsonResponse({ success: true, discordUserId, notifyPrefs });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured." }, 503);
    }
    console.error("auth self-extras failed:", err);
    return jsonResponse({ error: "Could not load notification settings." }, 500);
  }
}

async function handleAuthActivatePlan(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let data: { username?: string; plan?: string; displayName?: string; subscriptionId?: string };
  try {
    data = (await request.json()) as typeof data;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  const planRaw = String(data.plan || "").trim().toLowerCase();
  const tier = mapCheckoutPlanToTier(planRaw);
  if (!username) return jsonResponse({ error: "Username is required." }, 400);
  if (!tier) {
    return jsonResponse(
      { error: "Choose a valid plan (basic, premium, ultra, student-special, or student-ultra)." },
      400
    );
  }

  try {
    const existing = await getUserAccount(username, env);
    if (!existing) {
      return jsonResponse({ error: "Account not found. Log in and try again." }, 404);
    }

    const updated = await updateUserAccountSettings(username, { tier }, env);
    if (!updated) {
      return jsonResponse({ error: "Account not found. Log in and try again." }, 404);
    }

    // Ultra / Student Ultra also unlock video responses.
    if (planRaw === "ultra" || planRaw === "student-ultra" || planRaw === "student_ultra") {
      updated.videoResponseUnlock = true;
      await env.HOMEWORK_KV?.put(`user-account:${username}`, JSON.stringify(updated));
    }

    const subscriptionId = String(data.subscriptionId || "").trim();
    if (subscriptionId) {
      await savePaypalSubscription(
        username,
        { paypalSubscriptionId: subscriptionId, paypalPlan: planRaw },
        env
      );
    }

    const saved = (await getUserAccount(username, env)) || updated;
    const session = await attachSessionExtras(toAuthSession(saved), env);
    const planName = planLabelFromTier(tier);

    try {
      await armHwPlanReminder(
        {
          username,
          displayName: updated.displayName || data.displayName || username,
          tier,
          resetSchedule: true,
        },
        env
      );
    } catch (err) {
      console.error("activate-plan: arm HW reminder failed:", err);
    }

    const webhookUrl = getWebhook(env);
    if (webhookUrl) {
      const channelError = await getWebhookChannelMismatch(
        webhookUrl,
        env.DISCORD_CHANNEL_ID,
        "Discord notify channel"
      );
      if (channelError) {
        console.error("activate-plan discord:", channelError);
      } else {
        const discordResult = await notifyDiscord(webhookUrl, {
          title: "Website inquiries — homework plan paid (awaiting first HW)",
          color: 0x57a773,
          fields: [
            { name: "Username", value: session.username, inline: true },
            { name: "Email", value: session.email || "—", inline: true },
            { name: "Plan", value: planName, inline: true },
            {
              name: "Note",
              value:
                "Student confirmed PayPal checkout. Send their first homework when ready.",
            },
          ],
        });
        if (!discordResult.ok) {
          console.error(
            "activate-plan discord post failed:",
            discordResult.status,
            discordResult.detail
          );
        }
      }
    }

    try {
      await saveFeatureReport(
        {
          kind: "reminder",
          username: session.username,
          displayName: `${planName} paid — ${session.displayName || session.username}`,
          page: "Plan activate",
          message: [
            "New paid homework plan — waiting for first assignment.",
            `Student: ${session.displayName || session.username} (${session.username})`,
            `Plan: ${planName}`,
            `Email: ${session.email || "—"}`,
          ].join("\n"),
        },
        env
      );
    } catch (err) {
      console.error("activate-plan: Teacher Hub note failed:", err);
    }

    return jsonResponse({
      success: true,
      message: `${planName} plan is active. Waiting for JD to send your first homework.`,
      session,
      plan: String(data.plan || "").trim().toLowerCase(),
      planLabel: planName,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "INVALID_ACCOUNT_TIER") {
      return jsonResponse({ error: "Invalid plan tier." }, 400);
    }
    console.error("activate-plan failed:", err);
    return jsonResponse({ error: "Could not activate your plan. Try again." }, 500);
  }
}

async function handlePaypalCreateSubscription(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!paypalCredentialsConfigured(env)) {
    return jsonResponse(
      {
        error: "PayPal API not configured.",
        code: "PAYPAL_NOT_CONFIGURED",
        fallback: true,
      },
      503
    );
  }

  let data: {
    plan?: string;
    username?: string;
    email?: string;
    displayName?: string;
    origin?: string;
  };
  try {
    data = (await request.json()) as typeof data;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const plan = normalizeHwCheckoutPlan(data.plan);
  if (!plan) {
    return jsonResponse(
      { error: "Choose a valid plan (basic, premium, ultra, student-special, or student-ultra)." },
      400
    );
  }

  const username = String(data.username || "")
    .trim()
    .toLowerCase();
  if (!username) return jsonResponse({ error: "Username is required." }, 400);

  const reqUrl = new URL(request.url);
  const origin = String(data.origin || `${reqUrl.protocol}//${reqUrl.host}`).replace(
    /\/$/,
    ""
  );

  try {
    const result = await createPaypalSubscription(
      {
        plan,
        username,
        email: data.email,
        displayName: data.displayName,
        returnUrl: buildPaidReturnUrl(origin, plan),
        cancelUrl: buildCancelReturnUrl(origin, plan),
      },
      env
    );
    try {
      await savePaypalSubscription(
        username,
        {
          paypalSubscriptionId: result.subscriptionId,
          paypalPlan: result.plan,
        },
        env
      );
    } catch (err) {
      console.error("paypal create-subscription: could not save id:", err);
    }
    return jsonResponse({
      success: true,
      approveUrl: result.approveUrl,
      subscriptionId: result.subscriptionId,
      plan: result.plan,
      returnUrl: buildPaidReturnUrl(origin, plan),
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "PAYPAL_NOT_CONFIGURED") {
      return jsonResponse(
        { error: "PayPal API not configured.", code, fallback: true },
        503
      );
    }
    if (code === "PAYPAL_AUTH_FAILED") {
      return jsonResponse(
        { error: "PayPal login failed. Check client id/secret.", code },
        502
      );
    }
    if (code === "PAYPAL_CREATE_FAILED") {
      return jsonResponse(
        { error: "Could not start PayPal checkout. Try again.", code },
        502
      );
    }
    if (code === "USERNAME_REQUIRED" || code === "PLAN_INVALID" || code === "RETURN_URL_REQUIRED") {
      return jsonResponse({ error: "Missing plan or account details.", code }, 400);
    }
    console.error("paypal create-subscription failed:", err);
    return jsonResponse({ error: "Could not start PayPal checkout." }, 500);
  }
}

async function handleFeatureReports(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  try {
    const limit = Number(url.searchParams.get("limit") || "40");
    const reports = await listFeatureReports(env, { limit });
    return jsonResponse({ reports });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Report storage is not configured on this server." }, 503);
    }
    console.error("feature-reports list failed:", err);
    return jsonResponse({ error: "Could not load reports." }, 500);
  }
}

async function handleSocialReminders(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
    if (teacherUsername.trim().toLowerCase() !== allowed) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    try {
      const reminders = await listPendingSocialReminders(env);
      return jsonResponse({ reminders });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Reminder storage is not configured on this server." }, 503);
      }
      console.error("social-reminders list failed:", err);
      return jsonResponse({ error: "Could not load reminders." }, 500);
    }
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = (url.searchParams.get("id") || "").trim();
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
    if (teacherUsername.trim().toLowerCase() !== allowed) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (!id) return jsonResponse({ error: "Reminder id is required." }, 400);
    try {
      const ok = await cancelSocialReminder(id, env);
      if (!ok) return jsonResponse({ error: "Reminder not found (already fired or cancelled)." }, 404);
      return jsonResponse({ success: true, cancelled: id });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Reminder storage is not configured on this server." }, 503);
      }
      console.error("social-reminders cancel failed:", err);
      return jsonResponse({ error: "Could not cancel reminder." }, 500);
    }
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let data: SocialReminderArmPayload;
  try {
    data = (await request.json()) as SocialReminderArmPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!assertTeacherArm(env, data)) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  try {
    const job = await armSocialReminder(data, env);
    return jsonResponse({
      success: true,
      reminder: job,
      message: `Armed for ${job.fireAtUtc}`,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Reminder storage is not configured on this server." }, 503);
    }
    if (code === "FIRE_AT_REQUIRED") {
      return jsonResponse({ error: "fireAtUtc is required (ISO datetime)." }, 400);
    }
    if (code === "TITLES_REQUIRED") {
      return jsonResponse({ error: "clipTitles is required." }, 400);
    }
    if (
      code === "TITLES_TOO_LONG" ||
      code === "PIN_TOO_LONG" ||
      code === "STORY_TOO_LONG" ||
      code === "LINK_TOO_LONG"
    ) {
      return jsonResponse({ error: "One of the fields is too long." }, 400);
    }
    console.error("social-reminders arm failed:", err);
    return jsonResponse({ error: "Could not arm reminder." }, 500);
  }
}

async function handlePromoSignups(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
    if (teacherUsername.trim().toLowerCase() !== allowed) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }

    try {
      const limit = Number(url.searchParams.get("limit")) || 0;
      const signups = await listPromoSignups(env, limit > 0 ? { limit } : undefined);
      return jsonResponse({ signups });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Email list storage is not configured on this server." }, 503);
      }
      console.error("promo-signups list failed:", err);
      return jsonResponse({ error: "Could not load email list." }, 500);
    }
  }

  if (request.method === "POST") {
    try {
      const data = (await request.json()) as PromoSignupSavePayload;
      const result = await savePromoSignupTeacher(data, env);
      return jsonResponse({
        success: true,
        message: result.updated ? "Contact updated." : "Contact added.",
        id: result.id,
        updated: result.updated,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Email list storage is not configured on this server." }, 503);
      }
      if (code === "TEACHER_ONLY") {
        return jsonResponse({ error: "Teacher login required." }, 403);
      }
      if (code === "EMAIL_REQUIRED") {
        return jsonResponse({ error: "Email or contact info is required." }, 400);
      }
      if (code === "EMAIL_IN_USE") {
        return jsonResponse({ error: "That email is already on the list." }, 409);
      }
      if (code === "NOT_FOUND") {
        return jsonResponse({ error: "Contact not found." }, 404);
      }
      console.error("promo-signups save failed:", err);
      return jsonResponse({ error: "Could not save contact." }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function handleAuthSignup(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as SignupInput;
    const result = await createUserAccount(data, env);

    const webhookUrl = getWebhook(env);
    if (webhookUrl) {
      const channelError = await getWebhookChannelMismatch(
        webhookUrl,
        env.DISCORD_CHANNEL_ID,
        "Discord notify channel"
      );
      if (channelError) {
        console.error("auth signup discord:", channelError);
      } else {
        const discordResult = await notifyDiscord(webhookUrl, {
          title: "Website inquiries — new homework account",
          color: 0x57a773,
          fields: [
            { name: "Username", value: result.session.username, inline: true },
            { name: "Email", value: result.session.email, inline: true },
            {
              name: "Display name",
              value: result.session.displayName,
              inline: true,
            },
            { name: "Tier", value: result.session.tier, inline: true },
            {
              name: "Type",
              value: "Homework Hub account signup",
              inline: true,
            },
          ],
        });
        if (!discordResult.ok) {
          console.error(
            "auth signup discord post failed:",
            discordResult.status,
            discordResult.detail
          );
        }
      }
    } else {
      console.error("auth signup: DISCORD_WEBHOOK_URL not configured");
    }

    return jsonResponse({
      success: true,
      message: "Account created.",
      session: result.session,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "USERNAME_REQUIRED") {
      return jsonResponse({ error: "Username is required." }, 400);
    }
    if (code === "DISPLAY_NAME_REQUIRED") {
      return jsonResponse({ error: "First name is required." }, 400);
    }
    if (code === "DISPLAY_NAME_TOO_LONG") {
      return jsonResponse({ error: "Keep the first name under 40 characters." }, 400);
    }
    if (code === "PASSWORD_TOO_SHORT") {
      return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
    }
    if (code === "USERNAME_INVALID") {
      return jsonResponse(
        { error: "Username must be 3–24 characters: letters, numbers, _ or -." },
        400
      );
    }
    if (code === "USERNAME_RESERVED") {
      return jsonResponse({ error: "That username is reserved." }, 409);
    }
    if (code === "EMAIL_INVALID") {
      return jsonResponse({ error: "A valid email is required." }, 400);
    }
    if (code === "PASSWORD_REQUIRED") {
      return jsonResponse({ error: "Password is required." }, 400);
    }
    if (code === "USERNAME_TAKEN" || code === "EMAIL_TAKEN") {
      return jsonResponse({ error: "That email is already in use." }, 409);
    }
    console.error("auth signup failed:", err);
    return jsonResponse({ error: "Could not create account." }, 500);
  }
}

async function handleAuthUpdateProfile(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as {
      username?: string;
      password?: string;
      displayName?: string;
      email?: string;
      discordUserId?: string;
    };
    const username = String(data.username || "")
      .trim()
      .toLowerCase();
    const password = String(data.password || "");
    const displayName = String(data.displayName || "").trim();
    if (!username || !password) throw new Error("INVALID_CREDENTIALS");
    if (!displayName) throw new Error("DISPLAY_NAME_REQUIRED");
    if (displayName.length > 40) throw new Error("DISPLAY_NAME_TOO_LONG");
    const account = await getUserAccount(username, env);
    if (!account) throw new Error("INVALID_CREDENTIALS");
    const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");
    account.displayName = displayName;
    const email = String(data.email || "").trim().toLowerCase();
    if (email) account.email = email;
    await env.HOMEWORK_KV?.put(`user-account:${username}`, JSON.stringify(account));
    if (env.HOMEWORK_KV && data.discordUserId !== undefined) {
      await saveStudentDiscordUserId(env.HOMEWORK_KV, username, String(data.discordUserId || ""));
    }
    const session = await attachSessionExtras(toAuthSession(account), env);
    return jsonResponse({
      success: true,
      session,
      message: "Saved.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured." }, 503);
    }
    if (code === "INVALID_CREDENTIALS") {
      return jsonResponse({ error: "Username or password is wrong." }, 401);
    }
    if (code === "DISPLAY_NAME_REQUIRED") {
      return jsonResponse({ error: "Enter a display name (first name is fine)." }, 400);
    }
    if (code === "DISPLAY_NAME_TOO_LONG") {
      return jsonResponse({ error: "Keep the display name under 40 characters." }, 400);
    }
    if (code === "INVALID_DISCORD_USER_ID") {
      return jsonResponse(
        { error: "Discord ID should be the numbers-only User ID." },
        400
      );
    }
    console.error("auth update-profile failed:", err);
    return jsonResponse({ error: "Could not update profile." }, 500);
  }
}

async function handleAuthChangePassword(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as {
      username?: string;
      password?: string;
      newPassword?: string;
    };
    const result = await changeOwnPassword(
      {
        username: String(data.username || ""),
        password: String(data.password || ""),
        newPassword: String(data.newPassword || ""),
      },
      env
    );
    return jsonResponse({
      success: true,
      session: result.session,
      message: "Password updated.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured." }, 503);
    }
    if (code === "INVALID_CREDENTIALS") {
      return jsonResponse({ error: "Username or password is wrong." }, 401);
    }
    if (code === "PASSWORD_TOO_SHORT") {
      return jsonResponse({ error: "New password must be at least 6 characters." }, 400);
    }
    console.error("auth change-password failed:", err);
    return jsonResponse({ error: "Could not change password." }, 500);
  }
}

async function handleAuthDeleteOwnAccount(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as { username?: string; password?: string };
    const result = await deleteOwnAccount(
      {
        username: String(data.username || ""),
        password: String(data.password || ""),
      },
      env
    );
    return jsonResponse({
      success: true,
      username: result.username,
      deleted: result.deleted,
      message: result.deleted ? "Account deleted." : "Account not found.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured." }, 503);
    }
    if (code === "INVALID_CREDENTIALS") {
      return jsonResponse({ error: "Username or password is wrong." }, 401);
    }
    if (code === "PAYPAL_CANCEL_FAILED" || code === "PAYPAL_AUTH_FAILED") {
      return jsonResponse(
        {
          error:
            "Couldn't cancel the PayPal plan, so the account was left in place. Try again in a moment.",
          code,
        },
        502
      );
    }
    if (code === "PAYPAL_NOT_CONFIGURED") {
      return jsonResponse(
        {
          error:
            "PayPal isn't configured, so a billed account can't be deleted from here yet.",
          code,
        },
        503
      );
    }
    console.error("auth delete-own failed:", err);
    return jsonResponse({ error: "Could not delete account." }, 500);
  }
}

async function handleAuthDeleteAccount(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Unauthorized." }, 403);
  }

  try {
    const data = (await request.json()) as { username?: string };
    const result = await deleteUserAccount(String(data.username || ""), env);
    return jsonResponse({
      success: true,
      username: result.username,
      deleted: result.deleted,
      message: result.deleted ? "Account deleted." : "Account not found.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "USERNAME_REQUIRED") {
      return jsonResponse({ error: "Username is required." }, 400);
    }
    console.error("auth delete failed:", err);
    return jsonResponse({ error: "Could not delete account." }, 500);
  }
}

async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as LoginInput;
    const result = await loginUserAccount(data, env);
    const session = await attachSessionExtras(result.session, env);
    return jsonResponse({
      success: true,
      message: "Logged in.",
      session,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Account storage is not configured on this server." }, 503);
    }
    if (code === "INVALID_CREDENTIALS") {
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }
    console.error("auth login failed:", err);
    return jsonResponse({ error: "Could not log in." }, 500);
  }
}

async function handlePromoSignupDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as PromoSignupDeletePayload;
    const result = await deletePromoSignup(data, env);
    return jsonResponse({
      success: true,
      message: "Contact removed.",
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Email list storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED") {
      return jsonResponse({ error: "Contact id is required." }, 400);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Contact not found." }, 404);
    }
    console.error("promo-signups delete failed:", err);
    return jsonResponse({ error: "Could not delete contact." }, 500);
  }
}

const LISTEN_INSTRUCTION_RE =
  /Listen to the clip and write down what you think it's saying(\s+in Japanese)?\.?/gi;
const TRANSLATE_INSTRUCTION_RE = /Translate into English\.?/gi;

function stripSubmissionInstructions(text: string): string {
  return String(text || "")
    .replace(LISTEN_INSTRUCTION_RE, "")
    .replace(TRANSLATE_INSTRUCTION_RE, "")
    .replace(/___+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove inline furigana markers like 使[つか] → 使 */
function stripFurigana(text: string): string {
  return String(text || "")
    .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/\[[^\]\s]{1,16}\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStarPieces(raw: string): string[] | null {
  const s = String(raw || "").trim();
  if (!s.startsWith("[")) return null;
  try {
    const arr = JSON.parse(s) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.map((part) => String(part || "").trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function submissionItemNumber(row: HomeworkOrderedAnswerRow, index: number): string {
  const progress = row.progress?.trim();
  if (progress) {
    const match = progress.match(/^(\d+)/);
    if (match) return match[1];
  }
  if (index >= 0) return String(index + 1);
  return row.label?.trim() || "—";
}

function starStaticDisplay(prefix?: string, suffix?: string): string {
  const p = String(prefix || "").trim();
  const s = String(suffix || "").trim();
  if (p && s && s !== "。") return `${p} · ${s}`;
  return p || (s !== "。" ? s : "") || "";
}

interface AssignmentItemShape {
  id?: string;
  parts?: Array<{ type?: string; answer?: string; name?: string }>;
  prefix?: string;
  suffix?: string;
  japanese?: string;
}

interface AssignmentSectionShape {
  mode?: string;
  items?: AssignmentItemShape[];
}

function assignmentLinesInOrder(sections: AssignmentSectionShape[]): Array<{
  mode: string;
  item: AssignmentItemShape;
}> {
  const lines: Array<{ mode: string; item: AssignmentItemShape }> = [];
  for (const section of sections) {
    const mode = section.mode || "";
    for (const item of section.items || []) {
      lines.push({ mode, item });
    }
  }
  return lines;
}

async function loadAssignmentSections(
  env: Env,
  assignmentId: string
): Promise<AssignmentSectionShape[] | null> {
  const id = assignmentId.trim();
  if (!id) return null;
  try {
    if (env.HOMEWORK_KV) {
      const published = await loadPublishedAssignment(env.HOMEWORK_KV, id);
      if (published?.sections) return published.sections as AssignmentSectionShape[];
    }
    const assetRes = await env.ASSETS.fetch(
      new URL(`/homework/assignments/${id}.json`, "https://assets.local").toString()
    );
    if (isJsonAssetResponse(assetRes)) {
      const data = (await assetRes.json()) as { sections?: AssignmentSectionShape[] };
      return data.sections || null;
    }
  } catch {
    return null;
  }
  return null;
}

function enrichOrderedRowsFromAssignment(
  rows: HomeworkOrderedAnswerRow[],
  sections: AssignmentSectionShape[]
): HomeworkOrderedAnswerRow[] {
  const assignmentLines = assignmentLinesInOrder(sections);
  return rows.map((row, index) => {
    const line = assignmentLines[index];
    if (!line) return row;
    const { mode, item } = line;
    const enriched: HomeworkOrderedAnswerRow = { ...row };

    if (mode === "audio-listening") {
      const reference = item.parts?.find((part) => part.type === "blank")?.answer?.trim();
      if (reference) {
        enriched.reference = stripFurigana(reference);
        enriched.question = enriched.reference;
      }
    }

    if (mode === "star-order") {
      const prefix = String(item.prefix || "").trim();
      const suffix = String(item.suffix ?? "。").trim();
      const staticDisplay = starStaticDisplay(prefix, suffix);
      enriched.prefix = prefix;
      enriched.suffix = suffix;
      enriched.staticDisplay = staticDisplay;
      const pieces = parseStarPieces(enriched.student?.trim() || "");
      if (pieces?.length) {
        enriched.student = prefix + pieces.join("") + suffix;
        enriched.piecesDisplay = pieces.join(" · ");
      }
    }

    if (mode === "translation" && item.japanese?.trim()) {
      enriched.question = item.japanese.trim();
    }

    return enriched;
  });
}

function normalizeSubmissionRow(
  row: HomeworkOrderedAnswerRow,
  index: number
): {
  num: string;
  question: string;
  answer: string;
  piecesLine: string;
  mediaLabel: string;
  mediaId: string;
  mediaKind: string;
} {
  const blockType = (row.blockType || "").toLowerCase();
  const num = submissionItemNumber(row, index);
  let question = stripSubmissionInstructions(
    row.question?.trim() || row.reference?.trim() || row.staticDisplay?.trim() || ""
  );
  let answer = stripSubmissionInstructions(row.student?.trim() || "");
  let piecesLine = row.piecesDisplay?.trim() || "";

  if (blockType === "order") {
    if (!question) {
      question = starStaticDisplay(row.prefix, row.suffix);
    }
    const pieces = parseStarPieces(answer);
    if (pieces?.length && (row.prefix !== undefined || row.suffix !== undefined)) {
      answer = String(row.prefix || "") + pieces.join("") + String(row.suffix ?? "");
      piecesLine = pieces.join(" · ");
    } else if (pieces?.length) {
      answer = pieces.join("");
      piecesLine = pieces.join(" · ");
    }
    question = "";
  } else if (!piecesLine) {
    const pieces = parseStarPieces(answer);
    if (pieces) {
      answer = pieces.join("");
      piecesLine = pieces.join(" · ");
    }
  }

  if (blockType === "translation") {
    if (!question && row.prompt) question = stripSubmissionInstructions(row.prompt);
    if (!question && row.completed) {
      const completed = stripSubmissionInstructions(row.completed);
      if (completed && answer && completed.endsWith(answer)) {
        question = completed.slice(0, completed.length - answer.length).trim();
      }
    }
  }

  if (blockType === "listening") {
    if (!question && row.reference?.trim()) {
      question = stripSubmissionInstructions(row.reference);
    }
    if (!answer && row.completed) answer = stripSubmissionInstructions(row.completed);
  }

  if (row.completed && blockType !== "translation") {
    const completed = stripSubmissionInstructions(row.completed);
    if (completed && answer && completed !== answer && completed.includes(answer)) {
      const maybeQuestion = completed.replace(answer, "").trim();
      if (maybeQuestion && blockType !== "listening") {
        question = stripSubmissionInstructions(maybeQuestion);
      }
    }
  }

  let mediaLabel = "";
  const mediaId = row.mediaId?.trim() || "";
  let mediaKind = row.mediaKind || "";
  const studentLower = answer.toLowerCase();
  const isMedia =
    mediaKind === "video" ||
    mediaKind === "audio" ||
    blockType === "video" ||
    blockType === "audio" ||
    studentLower.includes("video submitted") ||
    studentLower.includes("video upload") ||
    studentLower.includes("audio submitted") ||
    studentLower.includes("audio upload") ||
    studentLower.includes("(submitted via video") ||
    studentLower.includes("(submitted via audio");

  if (isMedia) {
    if (studentLower.includes("not saved")) {
      mediaLabel = row.student?.trim() || "";
    } else {
      mediaLabel =
        mediaKind === "audio" || blockType === "audio" ? "Audio submitted" : "Video submitted";
    }
    if (!mediaKind) mediaKind = blockType === "audio" ? "audio" : "video";
    answer = "";
  } else if (!answer) {
    answer = "(blank)";
  }

  question = stripFurigana(question);
  if (blockType !== "translation") {
    answer = stripFurigana(answer);
  }

  return { num, question, answer, piecesLine, mediaLabel, mediaId, mediaKind };
}

function formatHomeworkAnswerDiscord(
  row: HomeworkOrderedAnswerRow,
  index: number,
  request?: Request,
  env?: Env
): { line: string; links: string[] } {
  const fmt = normalizeSubmissionRow(row, index);
  const num = String(fmt.num).replace(/[^\d]/g, "") || String(index + 1);

  if (fmt.mediaLabel) {
    const links: string[] = [];
    if (fmt.mediaId && request) {
      const listen = homeworkShortMediaUrl(request, fmt.mediaId, false);
      const download = homeworkShortMediaUrl(request, fmt.mediaId, true);
      // Keep URLs outside the code block so Discord makes them clickable.
      links.push(`[Listen](${listen}) · [Download](${download})`);
    }
    return { line: `${num}. ${fmt.mediaLabel}`, links };
  }

  return { line: `${num}. ${fmt.answer?.trim() || "(blank)"}`, links: [] };
}

function formatOrderedAnswersDiscord(
  rows: HomeworkOrderedAnswerRow[] | undefined,
  request?: Request,
  env?: Env
): { body: string; links: string[] } {
  if (!rows?.length) return { body: "(none)", links: [] };
  const lines: string[] = [];
  const links: string[] = [];
  rows.forEach((row, index) => {
    const part = formatHomeworkAnswerDiscord(row, index, request, env);
    lines.push(part.line);
    links.push(...part.links);
  });
  return { body: lines.join("\n"), links };
}

/** Code-block body + clickable audio/video URLs after the fence. */
function composeHomeworkDiscordMessage(plainBody: string, links: string[] = []): string {
  const code = wrapDiscordCodeBlock(plainBody);
  const cleanLinks = links.map((l) => String(l || "").trim()).filter(Boolean);
  if (!cleanLinks.length) return code;
  const joined = `${code}\n${cleanLinks.join("\n")}`;
  return clip(joined, 2000);
}

function homeworkNotifyHeadline(
  kind: string,
  displayName: string,
  username: string,
  lesson: string
): string {
  const who = `${displayName.trim() || username.trim()} (${username.trim()})`;
  const lessonBit = lesson.trim() ? `  — ${lesson.trim()}` : "";
  return `${kind} — ${who}${lessonBit}`;
}

function section2BlockType(row: HomeworkAnswerRow): string {
  const student = row.student?.trim() || "";
  if (student.startsWith("[")) return "Order";
  const blob = `${row.prompt || ""} ${row.completed || ""}`;
  if (/translate into english/i.test(blob)) return "Translation";
  return "Open response";
}

function legacyAnswersInWorksheetOrder(
  data: HomeworkSubmitPayload,
  videoRow?: HomeworkOrderedAnswerRow
): HomeworkOrderedAnswerRow[] {
  const listening = (data.listening || []).map((row) => ({
    ...row,
    blockType: "Listening",
  }));
  const grammar = (data.section1 || []).map((row) => ({
    ...row,
    blockType: "Grammar",
  }));
  const open = (data.section2 || []).map((row) => ({
    ...row,
    blockType: section2BlockType(row),
  }));
  const combined = [...listening, ...grammar, ...open];
  const rows = combined.map((row, index) => ({
    ...row,
    progress: String(index + 1),
  }));
  if (videoRow) {
    rows.push({
      ...videoRow,
      progress: String(rows.length + 1),
    });
  }
  return rows;
}

function buildHomeworkDiscordDescription(
  ordered: HomeworkOrderedAnswerRow[],
  _student: string,
  _lesson: string,
  request?: Request,
  env?: Env
): { body: string; links: string[] } {
  return formatOrderedAnswersDiscord(ordered, request, env);
}

async function buildHomeworkDiscordDescriptionForSubmit(
  data: HomeworkSubmitPayload,
  student: string,
  lesson: string,
  request: Request,
  env: Env,
  videoRow?: HomeworkOrderedAnswerRow
): Promise<{ body: string; title: string; links: string[] }> {
  let ordered: HomeworkOrderedAnswerRow[] = data.answers?.length
    ? videoRow
      ? [...data.answers, { ...videoRow, progress: String(data.answers.length + 1) }]
      : data.answers
    : legacyAnswersInWorksheetOrder(data, videoRow);

  if (data.assignmentId?.trim()) {
    const sections = await loadAssignmentSections(env, data.assignmentId);
    if (sections?.length) {
      ordered = enrichOrderedRowsFromAssignment(ordered, sections);
    }
  }

  const headline = homeworkNotifyHeadline(
    "Homework submitted",
    student,
    data.username!.trim(),
    lesson
  );
  const formatted = formatOrderedAnswersDiscord(ordered, request, env);
  const body = [headline, "", formatted.body].join("\n");

  return { body, title: headline, links: formatted.links };
}

function safeKeyPart(value: string | undefined, fallback: string): string {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return cleaned || fallback;
}

function extensionForSubmissionMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "video/mp4" || base === "video/quicktime") return "mp4";
  if (base === "video/webm") return "webm";
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/webm") return "webm";
  if (base === "audio/mpeg") return "mp3";
  if (base === "audio/ogg") return "ogg";
  if (base.startsWith("audio/")) return "audio";
  if (base.startsWith("video/")) return "video";
  return "bin";
}

function submissionMediaFilename(
  mimeType: string,
  storedName: string | undefined,
  mediaId: string
): string {
  const trimmed = String(storedName || "").trim();
  const fallback = `homework-${mediaId}.${extensionForSubmissionMime(mimeType)}`;
  if (trimmed && /\.[a-z0-9]{2,5}$/i.test(trimmed)) {
    return safeKeyPart(trimmed, fallback);
  }
  return fallback;
}

function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_") || "download";
  return `attachment; filename="${ascii}"`;
}

function homeworkShortMediaUrl(request: Request, mediaId: string, download: boolean): string {
  const url = new URL(`/api/hw-m/${encodeURIComponent(mediaId)}`, request.url);
  if (download) url.searchParams.set("d", "1");
  return url.toString();
}

function homeworkSubmissionMediaUrl(
  request: Request,
  env: Env,
  mediaId: string,
  download: boolean
): string {
  const teacher = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const url = new URL("/api/homework-submissions/video", request.url);
  url.searchParams.set("id", mediaId);
  url.searchParams.set("teacherUsername", teacher);
  if (download) url.searchParams.set("download", "1");
  return url.toString();
}

function isUploadedFile(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "type" in value &&
    "size" in value
  );
}

async function postDiscordWebhook(
  webhookUrl: string,
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const detail = await res.text();
  return { ok: false, status: res.status, detail: clip(detail, 500) };
}

/** Discord MessageFlags.SUPPRESS_EMBEDS — hide link previews / inline players. */
const DISCORD_SUPPRESS_EMBEDS = 4;

async function notifyHomeworkDiscord(
  webhookUrl: string,
  text: string,
  links: string[] = []
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const content = composeHomeworkDiscordMessage(text, links);
  const result = await postDiscordWebhook(webhookUrl, {
    content,
    flags: DISCORD_SUPPRESS_EMBEDS,
  });
  if (result.ok) return result;
  return postDiscordWebhook(webhookUrl, {
    flags: DISCORD_SUPPRESS_EMBEDS,
    content,
  });
}

async function notifyHomeworkDiscordWithFile(
  webhookUrl: string,
  text: string,
  file: File,
  links: string[] = []
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: composeHomeworkDiscordMessage(text, links),
      flags: DISCORD_SUPPRESS_EMBEDS,
    })
  );
  form.append("files[0]", file, safeKeyPart(file.name, "homework-photo.jpg"));

  const res = await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });
  if (res.ok) return { ok: true };
  const detail = await res.text();
  return { ok: false, status: res.status, detail: clip(detail, 500) };
}

function validateHomeworkSubmit(data: HomeworkSubmitPayload): string | null {
  if (!data.username?.trim()) return "Username is required.";
  if (!data.assignmentId?.trim()) return "Assignment is required.";
  const s1 = data.section1?.length ?? 0;
  const s2 = data.section2?.length ?? 0;
  const listening = data.listening?.length ?? 0;
  const ordered = data.answers?.length ?? 0;
  if (s1 + s2 + listening + ordered === 0) return "No answers to submit.";
  return null;
}

async function handleHomeworkSubmit(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
  let data: HomeworkSubmitPayload;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const error = validateHomeworkSubmit(data);
  if (error) return jsonResponse({ error }, 400);

  let stored = false;
  try {
    const submitInput = { ...(data as HomeworkOnlineSubmitInput) };
    const userKey = data.username!.trim().toLowerCase();
    const assignmentKey = data.assignmentId!.trim();
    if (!submitInput.comments?.length) {
      try {
        const commentsDraft = await loadHomeworkCommentsDraft(env, userKey, assignmentKey);
        if (commentsDraft?.comments?.length) {
          submitInput.comments = commentsDraft.comments;
        }
      } catch {
        /* draft optional */
      }
    }
    await saveHomeworkOnlineSubmission(submitInput, env);
    stored = true;
    try {
      await deleteHomeworkDraft(env, userKey, assignmentKey);
      await deleteHomeworkCommentsDraft(env, userKey, assignmentKey);
    } catch {
      /* draft cleanup is best-effort */
    }
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 400);
    }
    if (code !== "KV_NOT_CONFIGURED") {
      console.error("homework-submit store failed:", err);
    }
  }

  const webhook = resolveHomeworkWebhook(env);
  let discordOk = false;
  if (webhook) {
  if (webhook.usedFallback) {
    console.warn(
      "homework-submit: DISCORD_HOMEWORK_WEBHOOK_URL missing — using DISCORD_WEBHOOK_URL (site notify channel)"
    );
  }

  const channelError = await getWebhookChannelMismatch(
    webhook.url,
    webhook.channelId,
    webhook.usedFallback ? "notify channel (homework fallback)" : "homework submissions"
  );
  if (channelError) {
    console.warn("homework-submit channel check:", channelError);
  }

  const student = data.displayName?.trim() || data.username!.trim();
  const lesson = data.lessonName?.trim() || data.assignmentId!.trim();
    const { body: descriptionBody, links: mediaLinks } =
      await buildHomeworkDiscordDescriptionForSubmit(
      data,
      student,
      lesson,
      request,
      env
    );
  const bodyText = [
    webhook.usedFallback ? "[Homework — posted via site webhook until HW webhook is set]" : null,
      descriptionBody,
  ]
    .filter((line) => line != null)
    .join("\n");

  const result = await notifyHomeworkDiscord(webhook.url, bodyText, mediaLinks);
    discordOk = result.ok;
  if (!result.ok) {
    console.error("Homework Discord error", result.status, result.detail);
    }
  } else {
    console.error("homework-submit: no Discord webhook configured");
  }

  if (stored) {
    return jsonResponse({
      success: true,
      message: "Homework sent! Please await JD's review.",
    });
  }

  if (!webhook) {
    return jsonResponse(
      {
        error:
          "Homework submit is not set up on the server yet. Your answers are still saved in this browser — ask JD to enable homework storage.",
      },
      503
    );
  }

  if (!discordOk) {
    return jsonResponse(
      { error: "Could not send homework. Please try again in a few minutes." },
      502
    );
  }

  return jsonResponse({
    success: true,
    message: "Homework sent! Please await JD's review.",
  });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-submit failed:", detail);
    return jsonResponse({ error: "Homework submit failed. Please try again later." }, 500);
  }
}

async function handleHomeworkPhotoUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const displayName = String(form.get("displayName") || username).trim();
    const assignmentId = String(form.get("assignmentId") || "printed-homework").trim();
    const lessonName = String(form.get("lessonName") || assignmentId).trim();
    const file = form.get("photo");

    if (!username) return jsonResponse({ error: "Username is required." }, 400);
    if (!isUploadedFile(file)) return jsonResponse({ error: "Photo is required." }, 400);
    if (!file.type.startsWith("image/")) {
      return jsonResponse({ error: "Please upload an image file." }, 400);
    }
    if (file.size > 8 * 1024 * 1024) {
      return jsonResponse({ error: "Image must be under 8 MB." }, 400);
    }

    const photoMeta: HomeworkPhotoSubmitInput = {
      username,
      displayName,
      assignmentId,
      lessonName,
    };

    let stored = false;
    try {
      await saveHomeworkPhotoSubmission(photoMeta, file, env);
      stored = true;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 400);
      }
      if (code === "IMAGE_TYPE") {
        return jsonResponse({ error: "Please upload an image file." }, 400);
      }
      if (code === "IMAGE_TOO_LARGE") {
        return jsonResponse({ error: "Image must be under 8 MB." }, 400);
      }
      if (code !== "KV_NOT_CONFIGURED") {
        console.error("homework-photo store failed:", err);
      }
    }

    const webhook = resolveHomeworkWebhook(env);
    let discordOk = false;
    if (webhook) {
      const safeName = safeKeyPart(file.name, "homework-photo.jpg");
      const channelError = await getWebhookChannelMismatch(
        webhook.url,
        webhook.channelId,
        webhook.usedFallback ? "notify channel (homework fallback)" : "homework submissions"
      );
      if (channelError) {
        console.warn("homework-photo channel check:", channelError);
      }

      const text = [
        webhook.usedFallback
          ? "[Homework photo — posted via site webhook until HW webhook is set]"
          : null,
        homeworkNotifyHeadline("Printed homework photo", displayName, username, lessonName),
        `File: ${file.name || safeName} (${Math.round(file.size / 1024)} KB)`,
      ]
        .filter((line) => line != null)
        .join("\n");
      const result = await notifyHomeworkDiscordWithFile(webhook.url, text, file);
      discordOk = result.ok;
      if (!result.ok) {
        console.error("Homework photo Discord error", result.status, result.detail);
      }
    } else {
      console.error("homework-photo: no Discord webhook configured");
    }

    if (stored) {
      return jsonResponse({
        success: true,
        message: "Photo uploaded.",
      });
    }

    if (!webhook) {
      return jsonResponse(
        {
          error:
            "Photo upload is not set up on the server yet. Ask JD to enable homework storage.",
        },
        503
      );
    }

    if (!discordOk) {
      return jsonResponse(
        { error: "Could not send photo. Please try again in a few minutes." },
        502
      );
    }

    return jsonResponse({
      success: true,
      message: "Photo uploaded.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-photo-upload failed:", detail);
    return jsonResponse({ error: "Photo upload failed. Please try again later." }, 500);
  }
}

async function handleHomeworkVideoUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const displayName = String(form.get("displayName") || username).trim();
    const assignmentId = String(form.get("assignmentId") || "video-homework").trim();
    const lessonName = String(form.get("lessonName") || assignmentId).trim();
    const promptLabel = String(form.get("promptLabel") || "").trim();
    const promptId = String(form.get("promptId") || "").trim();
    const inlineSave =
      form.get("inlineSave") === "1" || Boolean(promptId || promptLabel);
    const file = form.get("video");

    if (!username) return jsonResponse({ error: "Username is required." }, 400);
    if (!isUploadedFile(file)) return jsonResponse({ error: "Video is required." }, 400);
    if (!file.type.startsWith("video/")) {
      const inferred = String(file.name || "").toLowerCase();
      const looksVideo = /\.(webm|mp4|mov|mkv)(\?|$)/i.test(inferred);
      if (!looksVideo) {
        return jsonResponse({ error: "Please upload a video file." }, 400);
      }
    }
    if (file.size > 24 * 1024 * 1024) {
      return jsonResponse({ error: "Video must be under 24 MB." }, 400);
    }

    const videoMeta: HomeworkVideoSubmitInput = {
      username,
      displayName,
      assignmentId,
      lessonName,
    };

    let stored = false;
    let saveResult: { id: string; videoId: string } | null = null;
    try {
      saveResult = await saveHomeworkVideoSubmission(videoMeta, file, env);
      stored = true;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 400);
      }
      if (code === "VIDEO_TYPE") {
        return jsonResponse({ error: "Please upload a video file." }, 400);
      }
      if (code === "VIDEO_TOO_LARGE") {
        return jsonResponse({ error: "Video must be under 24 MB." }, 400);
      }
      if (code !== "KV_NOT_CONFIGURED") {
        console.error("homework-video store failed:", err);
      }
    }

    if (inlineSave) {
      if (!stored) {
        return jsonResponse(
          {
            error:
              "Video upload is not set up on the server yet. Ask JD to enable homework storage.",
          },
          503
        );
      }
      return jsonResponse({
        success: true,
        mediaId: saveResult?.videoId,
        message: "Audio/video saved.",
      });
    }

    const webhook = resolveHomeworkWebhook(env);
    let discordOk = false;
    if (webhook) {
      const safeName = safeKeyPart(file.name, "homework-video.webm");
    const channelError = await getWebhookChannelMismatch(
      webhook.url,
      webhook.channelId,
      webhook.usedFallback ? "notify channel (homework fallback)" : "homework submissions"
    );
    if (channelError) {
        console.warn("homework-video channel check:", channelError);
    }

    const text = [
      webhook.usedFallback
          ? "[Homework video — posted via site webhook until HW webhook is set]"
        : null,
        homeworkNotifyHeadline("Video homework", displayName, username, lessonName),
        promptLabel ? `Prompt: ${promptLabel}` : null,
      `File: ${file.name || safeName} (${Math.round(file.size / 1024)} KB)`,
    ]
      .filter((line) => line != null)
      .join("\n");
    const mediaLinks = saveResult
      ? [
          `[Listen](${homeworkSubmissionMediaUrl(request, env, saveResult.videoId, false)}) · [Download](${homeworkSubmissionMediaUrl(request, env, saveResult.videoId, true)})`,
        ]
      : [];
    const result = await notifyHomeworkDiscordWithFile(webhook.url, text, file, mediaLinks);
      discordOk = result.ok;
    if (!result.ok) {
        console.error("Homework video Discord error", result.status, result.detail);
      }
    } else {
      console.error("homework-video: no Discord webhook configured");
    }

    if (stored) {
      return jsonResponse({
        success: true,
        mediaId: saveResult?.videoId,
        message: "Audio/video saved.",
      });
    }

    if (!webhook) {
      return jsonResponse(
        {
          error:
            "Video upload is not set up on the server yet. Ask JD to enable homework storage.",
        },
        503
      );
    }

    if (!discordOk) {
      return jsonResponse(
        { error: "Could not send video. Please try again in a few minutes." },
        502
      );
    }

    return jsonResponse({
      success: true,
      mediaId: saveResult?.videoId,
      message: "Audio/video saved.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-video-upload failed:", detail);
    return jsonResponse({ error: "Video upload failed. Please try again later." }, 500);
  }
}

async function handleHomeworkAudioUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim();
    const displayName = String(form.get("displayName") || username).trim();
    const assignmentId = String(form.get("assignmentId") || "audio-homework").trim();
    const lessonName = String(form.get("lessonName") || assignmentId).trim();
    const promptLabel = String(form.get("promptLabel") || "").trim();
    const promptId = String(form.get("promptId") || "").trim();
    const inlineSave =
      form.get("inlineSave") === "1" || Boolean(promptId || promptLabel);
    const file = form.get("audio");

    if (!username) return jsonResponse({ error: "Username is required." }, 400);
    if (!isUploadedFile(file)) return jsonResponse({ error: "Audio is required." }, 400);
    if (!file.type.startsWith("audio/")) {
      const inferred = String(file.name || "").toLowerCase();
      const looksAudio = /\.(webm|mp4|m4a|mp3|ogg)(\?|$)/i.test(inferred);
      if (!looksAudio) {
        return jsonResponse({ error: "Please upload an audio file." }, 400);
      }
    }
    if (file.size > 12 * 1024 * 1024) {
      return jsonResponse({ error: "Audio must be under 12 MB." }, 400);
    }

    const videoMeta: HomeworkVideoSubmitInput = {
      username,
      displayName,
      assignmentId,
      lessonName,
    };

    let stored = false;
    let saveResult: { id: string; videoId: string } | null = null;
    try {
      saveResult = await saveHomeworkVideoSubmission(videoMeta, file, env);
      stored = true;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 400);
      }
      if (code === "VIDEO_TYPE") {
        return jsonResponse({ error: "Please upload an audio file." }, 400);
      }
      if (code === "VIDEO_TOO_LARGE") {
        return jsonResponse({ error: "Audio must be under 12 MB." }, 400);
      }
      if (code !== "KV_NOT_CONFIGURED") {
        console.error("homework-audio store failed:", err);
      }
    }

    if (inlineSave) {
      if (!stored) {
        return jsonResponse(
          {
            error:
              "Audio upload is not set up on the server yet. Ask JD to enable homework storage.",
          },
          503
        );
      }
      return jsonResponse({
        success: true,
        mediaId: saveResult?.videoId,
        message: "Audio/video saved.",
      });
    }

    const webhook = resolveHomeworkWebhook(env);
    let discordOk = false;
    if (webhook) {
      const safeName = safeKeyPart(file.name, "homework-audio.webm");
      const channelError = await getWebhookChannelMismatch(
        webhook.url,
        webhook.channelId,
        webhook.usedFallback ? "notify channel (homework fallback)" : "homework submissions"
      );
      if (channelError) {
        console.warn("homework-audio channel check:", channelError);
      }

      const text = [
        webhook.usedFallback
          ? "[Homework audio — posted via site webhook until HW webhook is set]"
          : null,
        homeworkNotifyHeadline("Audio homework", displayName, username, lessonName),
        promptLabel ? `Prompt: ${promptLabel}` : null,
        `File: ${file.name || safeName} (${Math.round(file.size / 1024)} KB)`,
      ]
        .filter((line) => line != null)
        .join("\n");
      const mediaLinks = saveResult
        ? [
            `[Listen](${homeworkSubmissionMediaUrl(request, env, saveResult.videoId, false)}) · [Download](${homeworkSubmissionMediaUrl(request, env, saveResult.videoId, true)})`,
          ]
        : [];
      const result = await notifyHomeworkDiscordWithFile(webhook.url, text, file, mediaLinks);
      discordOk = result.ok;
      if (!result.ok) {
        console.error("Homework audio Discord error", result.status, result.detail);
      }
    } else {
      console.error("homework-audio: no Discord webhook configured");
    }

    if (stored) {
      return jsonResponse({
        success: true,
        mediaId: saveResult?.videoId,
        message: "Audio/video saved.",
      });
    }

    if (!webhook) {
      return jsonResponse(
        {
          error:
            "Audio upload is not set up on the server yet. Ask JD to enable homework storage.",
        },
        503
      );
    }

    if (!discordOk) {
      return jsonResponse(
        { error: "Could not send audio. Please try again in a few minutes." },
        502
      );
    }

    return jsonResponse({
      success: true,
      mediaId: saveResult?.videoId,
      message: "Audio/video saved.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("homework-audio-upload failed:", detail);
    return jsonResponse({ error: "Audio upload failed. Please try again later." }, 500);
  }
}

async function handleHomeworkReviewMediaUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const form = await request.formData();
    const teacherUsername = String(form.get("teacherUsername") || "").trim();
    if (!isTeacherMistakesAccess({ teacherUsername }, env)) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }

    const file = form.get("media") || form.get("audio") || form.get("video");
    if (!isUploadedFile(file)) {
      return jsonResponse({ error: "Audio or video file is required." }, 400);
    }

    const saved = await saveHomeworkReviewMedia(teacherUsername, file, env);
    return jsonResponse({
      success: true,
      mediaId: saved.id,
      mediaKind: saved.kind,
      mimeType: saved.mimeType,
      message: "Review clip saved.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Review media storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "VIDEO_TYPE") {
      return jsonResponse({ error: "Please upload an audio or video file." }, 400);
    }
    if (code === "VIDEO_TOO_LARGE") {
      return jsonResponse({ error: "File must be under 24 MB." }, 400);
    }
    console.error("homework-review-media-upload failed:", err);
    return jsonResponse({ error: "Could not save review clip." }, 500);
  }
}

async function handleHomeworkWorksheetImageUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const form = await request.formData();
    const teacherUsername = String(form.get("teacherUsername") || "").trim();
    const studentUsername = String(form.get("username") || form.get("studentUsername") || "").trim();
    const file = form.get("image") || form.get("file");
    if (!isUploadedFile(file)) {
      return jsonResponse({ error: "Please upload an image file." }, 400);
    }

    const saved = teacherUsername
      ? await saveWorksheetPromptImage(teacherUsername, file, env)
      : await saveStudentWorksheetImage(studentUsername, file, env);

    return jsonResponse({
      success: true,
      id: saved.id,
      mimeType: saved.mimeType,
      url: saved.urlPath,
      message: "Image saved.",
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Image storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "STUDENT_REQUIRED" || code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 400);
    }
    if (code === "IMAGE_TYPE") {
      return jsonResponse({ error: "Use a JPEG, PNG, GIF, or WebP image." }, 400);
    }
    if (code === "IMAGE_TOO_LARGE") {
      return jsonResponse({ error: "Image must be under 4 MB." }, 400);
    }
    console.error("homework-worksheet-image-upload failed:", err);
    return jsonResponse({ error: "Could not save image." }, 500);
  }
}

async function handleHomeworkWorksheetImage(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/hw-img\/([^/]+)$/);
    const id = match ? decodeURIComponent(match[1]) : url.searchParams.get("id") || "";
    const loaded = await loadWorksheetPromptImage(id, env);
    if (!loaded) return jsonResponse({ error: "Image not found." }, 404);

    return new Response(loaded.body, {
      status: 200,
      headers: {
        "Content-Type": loaded.mimeType,
        "Cache-Control": "public, max-age=86400",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Image storage is not configured on this server." }, 503);
    }
    console.error("homework-worksheet-image load failed:", err);
    return jsonResponse({ error: "Could not load image." }, 500);
  }
}

async function loadStaticCatalog(env: Env): Promise<CatalogFile> {
  const res = await env.ASSETS.fetch(
    new URL("/homework/catalog.json", "https://assets.local").toString()
  );
  if (!isJsonAssetResponse(res)) return { assignments: [] };
  return (await res.json()) as CatalogFile;
}

async function handleHomeworkCatalog(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const url = new URL(request.url);
    const staticCatalog = await loadStaticCatalog(env);
    const student = url.searchParams.get("student")?.trim().toLowerCase() || "";
    const merged = await mergeCatalog(staticCatalog, env.HOMEWORK_KV, student ? { student } : undefined);
    const extraHeaders: Record<string, string> = {
      /* Teacher catalog is large; short browser cache helps reopen the MRU dropdown. */
      "Cache-Control": student ? "private, max-age=30" : "private, max-age=60",
    };
    return jsonResponse(merged, 200, extraHeaders);
  } catch (err) {
    console.error("homework-catalog failed:", err);
    return jsonResponse({ error: "Could not load homework catalog." }, 500);
  }
}

async function handleHomeworkStudents(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername")?.trim() || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher only." }, 403);
  }
  if (!env.HOMEWORK_KV) {
    return jsonResponse({ error: "KV not configured." }, 503);
  }
  try {
    const students = await listAllStudentAccounts(env.HOMEWORK_KV);
    return jsonResponse(
      { students },
      200,
      { "Cache-Control": "private, max-age=60" }
    );
  } catch (err) {
    console.error("homework-students failed:", err);
    return jsonResponse({ error: "Could not load student list." }, 500);
  }
}

async function handleHomeworkAssignment(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id || !/^[a-z0-9-]+$/i.test(id)) {
    return jsonResponse({ error: "Invalid assignment id." }, 400);
  }

  try {
    if (env.HOMEWORK_KV) {
      const published = await loadPublishedAssignment(env.HOMEWORK_KV, id);
      if (published) return jsonResponse(published);
    }
    const assetRes = await env.ASSETS.fetch(
      new URL(`/homework/assignments/${id}.json`, "https://assets.local").toString()
    );
    if (isJsonAssetResponse(assetRes)) {
      return new Response(assetRes.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    }
    return jsonResponse({ error: "Assignment not found." }, 404);
  } catch (err) {
    console.error("homework-assignment failed:", err);
    return jsonResponse({ error: "Could not load assignment." }, 500);
  }
}

async function handleHomeworkPublish(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as PublishPayload;
    const sheetId = String(data.assignment?.id || data.catalogEntry?.id || "").trim();
    const staticCatalog = await loadStaticCatalog(env);
    const staticEntry = (staticCatalog.assignments || []).find((e) => String(e.id) === sheetId);
    const staticStudents = ((staticEntry as { students?: string[] } | undefined)?.students || [])
      .map((s) => String(s).toLowerCase())
      .filter(Boolean);
    const result = await publishToStudentHub(data, env, { staticStudents });
    const origin = new URL(request.url).origin;
    const studentUsername = String(data.studentUsername || "")
      .trim()
      .toLowerCase();
    const title = String(
      data.assignment?.title || data.catalogEntry?.title || result.id || "Homework"
    ).trim();
    const loginUrl =
      origin +
      "/homework.html?user=" +
      encodeURIComponent(studentUsername || "");
    const loginLink = "[Click to see your homework](" + loginUrl + ")";
    const publishDm = [
      result.queued ? "次の宿題を用意しました！" : "宿題を送りました！",
      title ? "【" + title + "】" : null,
      result.queued ? "今の宿題が終わったら開けるよ。" : null,
      loginLink,
    ]
      .filter(Boolean)
      .join("\n");

    /* Stealth edit from Student info: change the sheet, tell nobody. */
    const silent = data.silent === true;
    let discordNotify: DiscordNotifyResult | null = silent
      ? { ok: true, mode: "silent" }
      : null;
    if (!silent && env.HOMEWORK_KV && studentUsername) {
      try {
        const discordUserId = await getStudentDiscordUserId(env.HOMEWORK_KV, studentUsername);
        discordNotify = await notifyStudentWithTeacherFallback(env, {
          studentUsername,
          discordUserId,
          studentContent: publishDm,
          teacherContent: discordUserId
            ? "（→ " + studentUsername + "）\n" + publishDm
            : "宿題を送れませんでした（Discord user ID 未設定）: " +
              studentUsername +
              "\n【" +
              title +
              "】\n" +
              loginLink,
          copyTeacherOnStudentDm: true,
          teacherCopyContent: "（→ " + studentUsername + "）\n" + publishDm,
        });
      } catch (err) {
        console.error("homework-publish discord notify:", err);
      }
    }

    let lexiconAdded = 0;
    let lexiconPending = 0;
    let lexiconTexts = 0;
    let lexiconCandidates = 0;
    if (data.assignment && typeof data.assignment === "object") {
      try {
        const lexResult = await suggestMgLexiconFromAssignment(
          data.assignment as Record<string, unknown>,
          result.id,
          String(data.assignment.title || data.catalogEntry?.title || result.id),
          env,
          data.teacherUsername
        );
        lexiconAdded = lexResult.added;
        lexiconPending = lexResult.pending;
        lexiconTexts = lexResult.texts;
        lexiconCandidates = lexResult.candidates;
      } catch (err) {
        console.error("lexicon suggest from publish failed:", err);
      }
    }

    const slots = result.hubSlotsUsed;
    let message: string;
    if (result.queued) {
      message = result.updated
        ? `Updated queued homework for ${data.studentUsername} (${result.waitingCount} waiting, ${slots}/4 hub slots).`
        : `Queued for ${data.studentUsername} (${result.waitingCount} waiting, ${slots}/4 hub slots). Current sheet stays until they finish Done reviewing.`;
    } else if (result.updated) {
      message = `Updated homework for ${data.studentUsername}. They can refresh their Homework Hub to see your edits.`;
    } else {
      message = `Published for ${data.studentUsername}. They can open it on their Homework Hub now.`;
    }

    return jsonResponse({
      success: true,
      message,
      id: result.id,
      studentUrl: origin + result.studentUrl,
      updated: result.updated,
      queued: result.queued,
      queueCount: result.queueCount,
      waitingCount: result.waitingCount,
      currentHomeworkId: result.currentHomeworkId,
      hubSlotsUsed: result.hubSlotsUsed,
      lexiconAdded,
      lexiconPending,
      lexiconTexts,
      lexiconCandidates,
      discordNotify,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED" || code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Student id and worksheet id are required." }, 400);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse(
        { error: "Unknown student id. Add the account in hw-auth.js first." },
        400
      );
    }
    if (code === "HUB_FULL") {
      return jsonResponse(
        {
          error:
            "Hub full (4/4) — student must finish Done reviewing on a sheet before you can send another.",
        },
        409
      );
    }
    console.error("homework-publish failed:", err);
    return jsonResponse({ error: "Could not publish homework." }, 500);
  }
}

async function handleHomeworkSaveWorksheet(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as SaveWorksheetPayload;
    const result = await saveWorksheetDraft(data, env);
    return jsonResponse({
      success: true,
      message: result.updated
        ? `Updated worksheet “${result.id}” in the library.`
        : `Saved worksheet “${result.id}” to the library.`,
      id: result.id,
      updated: result.updated,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED") {
      return jsonResponse({ error: "Worksheet id is required." }, 400);
    }
    console.error("homework-save-worksheet failed:", err);
    return jsonResponse({ error: "Could not save worksheet." }, 500);
  }
}

async function handleHomeworkDeleteWorksheet(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as DeleteWorksheetPayload;
    const result = await deleteWorksheetFromLibrary(data, env);
    return jsonResponse({
      success: true,
      message: `Deleted worksheet “${result.id}” from the library.`,
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED" || code === "INVALID_ID") {
      return jsonResponse({ error: "Worksheet id is required." }, 400);
    }
    if (code === "NOT_IN_LIBRARY") {
      return jsonResponse(
        {
          error:
            "This worksheet is not in your saved library (it may be a built-in sheet). Only maker-saved sheets can be deleted here.",
        },
        404
      );
    }
    console.error("homework-delete-worksheet failed:", err);
    return jsonResponse({ error: "Could not delete worksheet." }, 500);
  }
}

async function handleHomeworkStudentProfile(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    try {
      const url = new URL(request.url);
      const staticCatalog = await loadStaticCatalog(env);
      const profile = await getStudentProfileForTeacher(
        {
          teacherUsername: url.searchParams.get("teacherUsername") || "",
          studentUsername: url.searchParams.get("studentUsername") || "",
        },
        env,
        staticCatalog.studentProfiles
      );
      return jsonResponse({ success: true, profile });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
      }
      if (code === "TEACHER_ONLY") {
        return jsonResponse({ error: "Teacher login required." }, 403);
      }
      if (code === "STUDENT_REQUIRED") {
        return jsonResponse({ error: "Student id is required." }, 400);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student id." }, 400);
      }
      console.error("homework-student-profile get failed:", err);
      return jsonResponse({ error: "Could not load student info." }, 500);
    }
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as StudentProfilePayload;
    const result = await saveStudentProfile(data, env);

    if (data.tier !== undefined) {
      const tier = String(data.tier || "").trim();
      try {
        if (tier === "pending" || !tier) {
          await clearHwPlanReminder(result.student, env);
        } else {
          const account = await getUserAccount(result.student, env);
          await armHwPlanReminder(
            {
              username: result.student,
              displayName: account?.displayName || result.student,
              tier: (tier as "tier1" | "tier2" | "tier3" | "student_special" | "pending"),
              resetSchedule: true,
            },
            env
          );
        }
      } catch (err) {
        console.error("student-profile: HW reminder re-arm failed:", err);
      }
    }

    return jsonResponse({
      success: true,
      message: `Saved info for ${result.student}. They can refresh their Homework Hub to see updates.`,
      student: result.student,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Student id is required." }, 400);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student id." }, 400);
    }
    if (code === "INVALID_ACCOUNT_LABEL" || code === "INVALID_ACCOUNT_TIER") {
      return jsonResponse({ error: "Invalid account type or plan tier." }, 400);
    }
    if (code === "INVALID_DISCORD_USER_ID") {
      return jsonResponse(
        {
          error:
            "Discord user ID must be digits only (Developer Mode → right-click their profile → Copy User ID).",
        },
        400
      );
    }
    console.error("homework-student-profile failed:", err);
    return jsonResponse({ error: "Could not save student info." }, 500);
  }
}

async function handleHomeworkStudentWipe(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as {
      teacherUsername?: string;
      studentUsername?: string;
      confirmDelete?: string;
    };
    const result = await wipeStudentCompletely(data, env);
    return jsonResponse({
      success: true,
      message: result.stillInCodeDemoList
        ? `Wiped ${result.username} from live data, but they remain in the built-in demo login list until removed from code.`
        : `Fully wiped ${result.username}.`,
      result,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Publish storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Student id is required." }, 400);
    }
    if (code === "CANNOT_WIPE_TEACHER") {
      return jsonResponse({ error: "Cannot wipe the teacher account." }, 400);
    }
    if (code === "CONFIRM_REQUIRED") {
      return jsonResponse({ error: "Type DELETE to confirm." }, 400);
    }
    console.error("homework-student-wipe failed:", err);
    return jsonResponse({ error: "Could not wipe student." }, 500);
  }
}

async function handleHomeworkGenerate(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as HomeworkGenerateRequest;
    const result = await generateHomeworkWithAi(data, env);
    return jsonResponse({ success: true, ...result });
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "GRAMMAR_REQUIRED" || code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Grammar point and student id are required." }, 400);
    }
    if (code === "AI_FAILED" || code === "AI_EMPTY" || code === "AI_INVALID") {
      return jsonResponse(
        { error: "AI could not build homework. Try again or edit manually." },
        502
      );
    }
    console.error("homework-generate failed:", err);
    return jsonResponse({ error: "Homework generation failed." }, 500);
  }
}

async function handleTeacherIdeas(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
    if (teacherUsername.trim().toLowerCase() !== allowed) {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    try {
      const [ideas, tags, customTags] = await Promise.all([
        listTeacherIdeas(env),
        listTeacherIdeaTags(env),
        listCustomTeacherIdeaTags(env),
      ]);
      return jsonResponse({ ideas, tags, customTags });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
      }
      console.error("teacher-ideas list failed:", err);
      return jsonResponse({ error: "Could not load ideas." }, 500);
    }
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaPayload;
    const result = await saveTeacherIdea(data, env);
    return jsonResponse({
      success: true,
      message: result.updated ? "Idea updated." : "Idea saved.",
      id: result.id,
      updated: result.updated,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "TEXT_REQUIRED" || code === "CONTENT_REQUIRED") {
      return jsonResponse({ error: "Add some text or at least one image before saving." }, 400);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Idea not found." }, 404);
    }
    console.error("teacher-ideas save failed:", err);
    return jsonResponse({ error: "Could not save idea." }, 500);
  }
}

async function handleTeacherIdeaTag(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaTagPayload;
    const result = await addTeacherIdeaTag(data, env);
    return jsonResponse({
      success: true,
      message: `Tag “${result.tag}” added.`,
      tag: result.tag,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "TAG_INVALID") {
      return jsonResponse({ error: "Use letters, numbers, or hyphens (max 24 chars)." }, 400);
    }
    console.error("teacher-ideas tag failed:", err);
    return jsonResponse({ error: "Could not add tag." }, 500);
  }
}

async function handleTeacherIdeaImageUpload(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const form = await request.formData();
    const teacherUsername = String(form.get("teacherUsername") || "").trim();
    const file = form.get("image");
    if (!isUploadedFile(file)) {
      return jsonResponse({ error: "Image file is required." }, 400);
    }

    const result = await uploadTeacherIdeaImage(teacherUsername, file, env);
    const origin = new URL(request.url).origin;
    const url =
      origin +
      "/api/teacher-ideas/image?id=" +
      encodeURIComponent(result.id) +
      "&teacherUsername=" +
      encodeURIComponent(teacherUsername);
    return jsonResponse({
      success: true,
      message: "Image uploaded.",
      ...result,
      url,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "IMAGE_TYPE") {
      return jsonResponse({ error: "Use a JPEG, PNG, GIF, or WebP image." }, 400);
    }
    if (code === "IMAGE_TOO_LARGE") {
      return jsonResponse({ error: "Image must be under 4 MB." }, 400);
    }
    console.error("teacher-ideas image upload failed:", err);
    return jsonResponse({ error: "Could not upload image." }, 500);
  }
}

async function handleTeacherIdeaImage(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = url.searchParams.get("id") || "";
    const loaded = await loadTeacherIdeaImage(teacherUsername, id, env);
    if (!loaded) return jsonResponse({ error: "Image not found." }, 404);

    return new Response(loaded.body, {
      status: 200,
      headers: {
        "Content-Type": loaded.mimeType,
        "Cache-Control": "private, max-age=3600",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    console.error("teacher-ideas image load failed:", err);
    return jsonResponse({ error: "Could not load image." }, 500);
  }
}

async function handleTeacherIdeaImageDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaImageDeletePayload;
    const result = await deleteTeacherIdeaImage(data, env);
    return jsonResponse({
      success: true,
      message: "Image deleted.",
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED" || code === "NOT_FOUND") {
      return jsonResponse({ error: "Image not found." }, 404);
    }
    console.error("teacher-ideas image delete failed:", err);
    return jsonResponse({ error: "Could not delete image." }, 500);
  }
}

async function handleTeacherIdeaTagDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaTagPayload;
    const result = await deleteTeacherIdeaTag(data, env);
    return jsonResponse({
      success: true,
      message: `Tag “${result.tag}” deleted.`,
      tag: result.tag,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "TAG_INVALID" || code === "NOT_FOUND") {
      return jsonResponse({ error: "Tag not found." }, 404);
    }
    if (code === "TAG_DEFAULT") {
      return jsonResponse({ error: "Built-in tags cannot be deleted." }, 400);
    }
    console.error("teacher-ideas tag delete failed:", err);
    return jsonResponse({ error: "Could not delete tag." }, 500);
  }
}

async function handleTeacherIdeaDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as TeacherIdeaDeletePayload;
    const result = await deleteTeacherIdea(data, env);
    return jsonResponse({
      success: true,
      message: "Idea deleted.",
      id: result.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Ideas storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "ID_REQUIRED") {
      return jsonResponse({ error: "Idea id is required." }, 400);
    }
    console.error("teacher-ideas delete failed:", err);
    return jsonResponse({ error: "Could not delete idea." }, 500);
  }
}

/** Teacher-only: probe Discord bot token without leaking it. */
async function handleDiscordBotStatus(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  try {
    const status = await getDiscordBotStatus(env);
    return jsonResponse(status);
  } catch (err) {
    console.error("discord-bot-status failed:", err);
    return jsonResponse({
      ok: false,
      tokenConfigured: Boolean(String(env.DISCORD_BOT_TOKEN || "").trim()),
      teacherIdConfigured: Boolean(String(env.DISCORD_TEACHER_USER_ID || "").trim()),
      hasHomeworkWebhook: Boolean(
        String(env.DISCORD_HOMEWORK_WEBHOOK_URL || env.DISCORD_WEBHOOK_URL || "").trim()
      ),
      hint: "Could not reach Discord API",
    });
  }
}

async function handleStudentMistakes(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const username = url.searchParams.get("username") || "";
    const student = url.searchParams.get("student") || "";
    const status = url.searchParams.get("status") || "";
    const mistakesKey = url.searchParams.get("mistakesKey") || "";
    const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();

    try {
      if (
        teacherUsername.trim().toLowerCase() === allowed ||
        isTeacherMistakesAccess({ mistakesKey }, env)
      ) {
        const mistakes = await listStudentMistakes(env, {
          student: student || undefined,
          status: status || undefined,
        });
        return jsonResponse({ mistakes }, 200, { "Cache-Control": "private, no-store" });
      }

      const studentUser = username.trim().toLowerCase();
      if (!studentUser) {
        return jsonResponse({ error: "Student login required." }, 403);
      }
      if (!(await isKnownStudent(studentUser, env))) {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }

      const mistakes = await listStudentMistakes(env, {
        student: studentUser,
        status: status || undefined,
      });
      return jsonResponse({ mistakes }, 200, { "Cache-Control": "private, no-store" });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Mistake storage is not configured on this server." }, 503);
      }
      console.error("student-mistakes list failed:", err);
      return jsonResponse({ error: "Could not load mistakes." }, 500);
    }
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as StudentMistakePayload;
    const result = await saveStudentMistake(data, env);
    return jsonResponse({
      success: true,
      message: result.updated ? "Mistake updated." : "Mistake logged.",
      id: result.id,
      updated: result.updated,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Mistake storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "CONTENT_REQUIRED") {
      return jsonResponse({ error: "Describe what the student said or wrote." }, 400);
    }
    if (code === "STUDENT_REQUIRED") {
      return jsonResponse({ error: "Choose a student." }, 400);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student id." }, 400);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Mistake not found." }, 404);
    }
    console.error("student-mistakes save failed:", err);
    return jsonResponse({ error: "Could not save mistake." }, 500);
  }
}

async function handleStudentMistakeDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as StudentMistakeDeletePayload;
    const result = await deleteStudentMistake(data, env);
    return jsonResponse({ success: true, message: "Mistake deleted.", id: result.id });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Mistake storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Mistake not found." }, 404);
    }
    console.error("student-mistakes delete failed:", err);
    return jsonResponse({ error: "Could not delete mistake." }, 500);
  }
}

async function handleStudentMistakeResolve(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as StudentMistakeResolvePayload;
    const result = await resolveStudentMistake(data, env);
    return jsonResponse({ success: true, message: "Moved to trash.", id: result.id });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Mistake storage is not configured on this server." }, 503);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }
    if (code === "FORBIDDEN") {
      return jsonResponse({ error: "Not allowed." }, 403);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Mistake not found." }, 404);
    }
    console.error("student-mistakes resolve failed:", err);
    return jsonResponse({ error: "Could not update mistake." }, 500);
  }
}

async function handleStudentMistakeRestore(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as StudentMistakeResolvePayload;
    const result = await restoreStudentMistake(data, env);
    return jsonResponse({ success: true, message: "Restored.", id: result.id });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Mistake storage is not configured on this server." }, 503);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }
    if (code === "FORBIDDEN") {
      return jsonResponse({ error: "Not allowed." }, 403);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Mistake not found." }, 404);
    }
    console.error("student-mistakes restore failed:", err);
    return jsonResponse({ error: "Could not restore mistake." }, 500);
  }
}

async function handleHomeworkSubmissionDiscordPreview(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST" && request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  const onlineId = url.searchParams.get("onlineId") || url.searchParams.get("id") || "";
  const videoSubmissionId = url.searchParams.get("videoSubmissionId") || "";
  if (!onlineId) return jsonResponse({ error: "onlineId is required." }, 400);

  try {
    const submission = await getHomeworkSubmission(env, onlineId);
    if (!submission || submission.type !== "online") {
      return jsonResponse({ error: "Online submission not found." }, 404);
    }

    let videoRow: HomeworkOrderedAnswerRow | undefined;
    if (videoSubmissionId) {
      const videoSub = await getHomeworkSubmission(env, videoSubmissionId);
      if (videoSub?.video?.id) {
        const isAudio = videoSub.video.mimeType?.startsWith("audio/");
        videoRow = {
          blockType: isAudio ? "Audio" : "Video",
          student: isAudio ? "Audio submitted" : "Video submitted",
          mediaId: videoSub.video.id,
          mediaKind: isAudio ? "audio" : "video",
        };
      }
    }

    const student = submission.displayName?.trim() || submission.username;
    const lesson = submission.lessonName?.trim() || submission.assignmentId || "Homework";
    const payload: HomeworkSubmitPayload = {
      username: submission.username,
      displayName: submission.displayName,
      assignmentId: submission.assignmentId,
      lessonName: submission.lessonName,
      title: submission.title,
      section1: submission.section1,
      section2: submission.section2,
      listening: submission.listening,
      answers: submission.answers,
    };

    const { body: descriptionBody, links: mediaLinks } =
      await buildHomeworkDiscordDescriptionForSubmit(
      payload,
      student,
      lesson,
      request,
      env,
      videoRow
    );

    const bodyText = [
      "[TEST — new submission format preview]",
      descriptionBody,
    ].join("\n");

    const webhook = resolveHomeworkWebhook(env);
    if (!webhook) {
      return jsonResponse({ error: "Homework Discord webhook is not configured." }, 503);
    }

    const composed = composeHomeworkDiscordMessage(bodyText, mediaLinks);
    const result = await notifyHomeworkDiscord(webhook.url, bodyText, mediaLinks);
    if (!result.ok) {
      return jsonResponse({ error: "Could not post to Discord.", detail: result.detail }, 502);
    }

    return jsonResponse({
      success: true,
      message: "Test preview posted to Discord.",
      preview: composed,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured." }, 503);
    }
    console.error("homework discord preview failed:", err);
    return jsonResponse({ error: "Could not send preview." }, 500);
  }
}

async function handleHomeworkDraft(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  let username = String(url.searchParams.get("username") || "")
    .trim()
    .toLowerCase();
  let assignmentId = String(url.searchParams.get("assignmentId") || "").trim();

  if (request.method === "PUT") {
    let body: HomeworkDraftSaveInput;
    try {
      body = (await request.json()) as HomeworkDraftSaveInput;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }
    const bodyUser = String(body.username || "")
      .trim()
      .toLowerCase();
    if (!username) username = bodyUser;
    if (!assignmentId) assignmentId = String(body.assignmentId || "").trim();
    if (!username) {
      return jsonResponse({ error: "Student login required." }, 403);
    }
    if (bodyUser && bodyUser !== username) {
      return jsonResponse({ error: "Account mismatch." }, 403);
    }

    try {
      if (!(await isKnownStudent(username, env))) {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (!assignmentId) {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      await saveHomeworkDraft({ ...body, username, assignmentId }, env);
      return jsonResponse({ success: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Draft storage is not configured on this server." }, 503);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (code === "ASSIGNMENT_REQUIRED") {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      console.error("homework-draft PUT failed:", err);
      return jsonResponse({ error: "Could not save draft." }, 500);
    }
  }

  if (!username) {
    return jsonResponse({ error: "Student login required." }, 403);
  }

  try {
    if (!(await isKnownStudent(username, env))) {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }

    if (request.method === "GET") {
      if (!assignmentId) {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      const draft = await loadHomeworkDraft(env, username, assignmentId);
      return jsonResponse({ draft }, 200, { "Cache-Control": "private, no-store" });
    }

    if (request.method === "DELETE") {
      if (!assignmentId) {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      await deleteHomeworkDraft(env, username, assignmentId);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Draft storage is not configured on this server." }, 503);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }
    if (code === "ASSIGNMENT_REQUIRED") {
      return jsonResponse({ error: "Assignment id is required." }, 400);
    }
    console.error("homework-draft failed:", err);
    return jsonResponse({ error: "Could not save draft." }, 500);
  }
}

async function handleHomeworkCommentsDraft(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  let username = String(url.searchParams.get("username") || "")
    .trim()
    .toLowerCase();
  let assignmentId = String(url.searchParams.get("assignmentId") || "").trim();

  if (request.method === "PUT") {
    let body: HomeworkCommentsDraftSaveInput;
    try {
      body = (await request.json()) as HomeworkCommentsDraftSaveInput;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }
    const bodyUser = String(body.username || "")
      .trim()
      .toLowerCase();
    if (!username) username = bodyUser;
    if (!assignmentId) assignmentId = String(body.assignmentId || "").trim();
    if (!username) {
      return jsonResponse({ error: "Student login required." }, 403);
    }
    if (bodyUser && bodyUser !== username) {
      return jsonResponse({ error: "Account mismatch." }, 403);
    }

    try {
      if (!(await isKnownStudent(username, env))) {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (!assignmentId) {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      await saveHomeworkCommentsDraft({ ...body, username, assignmentId }, env);
      return jsonResponse({ success: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Comment storage is not configured on this server." }, 503);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (code === "ASSIGNMENT_REQUIRED") {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      console.error("homework-comments-draft PUT failed:", err);
      return jsonResponse({ error: "Could not save comments." }, 500);
    }
  }

  if (!username) {
    return jsonResponse({ error: "Student login required." }, 403);
  }

  try {
    if (!(await isKnownStudent(username, env))) {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }

    if (request.method === "GET") {
      if (!assignmentId) {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      const draft = await loadHomeworkCommentsDraft(env, username, assignmentId);
      return jsonResponse({ draft }, 200, { "Cache-Control": "private, no-store" });
    }

    if (request.method === "DELETE") {
      if (!assignmentId) {
        return jsonResponse({ error: "Assignment id is required." }, 400);
      }
      await deleteHomeworkCommentsDraft(env, username, assignmentId);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Comment storage is not configured on this server." }, 503);
    }
    console.error("homework-comments-draft failed:", err);
    return jsonResponse({ error: "Could not load comments." }, 500);
  }
}

/** Replies JD already used on this worksheet, so review can start pre-filled. */
async function handleHomeworkAnswerBank(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(request.url);
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const teacherUsername = (url.searchParams.get("teacherUsername") || "").trim().toLowerCase();
  if (!teacherUsername || teacherUsername !== allowed) {
    return jsonResponse({ error: "Teacher only." }, 403);
  }
  const assignmentId = (url.searchParams.get("assignmentId") || "").trim();
  if (!assignmentId || !/^[a-z0-9-]+$/i.test(assignmentId)) {
    return jsonResponse({ error: "Invalid assignment id." }, 400);
  }
  try {
    const bank = await readAnswerBank(env.HOMEWORK_KV, assignmentId);
    return jsonResponse(
      { ok: true, assignmentId, slides: bank?.slides || {} },
      200,
      { "Cache-Control": "private, no-store" }
    );
  } catch (err) {
    console.error("homework-answer-bank failed:", err);
    return jsonResponse({ error: "Could not load saved replies." }, 500);
  }
}

async function handleHomeworkReview(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: HomeworkReviewSaveInput;
  try {
    body = (await request.json()) as HomeworkReviewSaveInput;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const teacherUsername = String(body.teacherUsername || "")
    .trim()
    .toLowerCase();
  if (!teacherUsername || teacherUsername !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  try {
    const existingBefore = await getHomeworkSubmission(
      env,
      String(body.submissionId || "").trim()
    );
    const wasReviewed = existingBefore?.reviewStatus === "reviewed";
    const submission = await saveHomeworkReview(body, env);

    let discordNotify = null;
    const newlyReviewed = submission.reviewStatus === "reviewed" && !wasReviewed;
    if (newlyReviewed && env.HOMEWORK_KV) {
      try {
        const studentUsername = String(submission.username || "").trim().toLowerCase();
        const origin = new URL(request.url).origin;
        const hubUrl = origin + "/homework/platform.html";
        const loginUrl =
          origin +
          "/homework.html?user=" +
          encodeURIComponent(studentUsername);
        const lesson = String(submission.lessonName || submission.assignmentId || "Homework").trim();
        if (studentUsername) {
          const discordUserId = await getStudentDiscordUserId(env.HOMEWORK_KV, studentUsername);
          discordNotify = await notifyStudentWithTeacherFallback(env, {
            studentUsername,
            discordUserId,
            studentContent: [
              "JD finished reviewing your homework.",
              lesson ? `“${lesson}”` : null,
              "",
              "Homework login: " + loginUrl,
              "Open Homework Hub to see the review: " + hubUrl,
            ]
              .filter(Boolean)
              .join("\n"),
            teacherContent: discordUserId
              ? `Review ready for ${studentUsername}: ${lesson}\nHomework login: ${loginUrl}`
              : `Review ready for ${studentUsername} (${lesson}) — no Discord user ID linked. Add it in Student info so they get DMs.\nHomework login: ${loginUrl}`,
          });
        }
      } catch (err) {
        console.error("homework-review discord notify:", err);
      }
    }

    return jsonResponse(
      { ok: true, submission, discordNotify },
      200,
      { "Cache-Control": "private, no-store" }
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    if (code === "SUBMISSION_REQUIRED") {
      return jsonResponse({ error: "Submission id is required." }, 400);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Submission not found." }, 404);
    }
    console.error("homework-review failed:", err);
    return jsonResponse({ error: "Could not save review notes." }, 500);
  }
}

async function handleDailyNotebook(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const allowedTeacher = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const teacherUsername = String(url.searchParams.get("teacherUsername") || "")
    .trim()
    .toLowerCase();
  const isTeacher = teacherUsername === allowedTeacher;

  if (request.method === "GET") {
    let username = String(url.searchParams.get("username") || "")
      .trim()
      .toLowerCase();
    const student = String(url.searchParams.get("student") || "")
      .trim()
      .toLowerCase();
    if (isTeacher && student) username = student;
    if (!username) {
      return jsonResponse({ error: "Student login required." }, 403);
    }

    const date = String(url.searchParams.get("date") || "").trim();
    try {
      if (!(await isKnownStudent(username, env))) {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      const payload = await getDailyNotebook(env, {
        username,
        date: date || undefined,
      });
      return jsonResponse(payload, 200, { "Cache-Control": "private, no-store" });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Notebook storage is not configured on this server." }, 503);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (code === "DATE_INVALID") {
        return jsonResponse({ error: "Date must be YYYY-MM-DD." }, 400);
      }
      if (code === "DATE_FUTURE") {
        return jsonResponse({ error: "Cannot open a future notebook day." }, 400);
      }
      console.error("daily-notebook GET failed:", err);
      return jsonResponse({ error: "Could not load daily notebook." }, 500);
    }
  }

  if (request.method === "PUT" || request.method === "POST") {
    let body: DailyNotebookSaveInput;
    try {
      body = (await request.json()) as DailyNotebookSaveInput;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    if (!username) {
      return jsonResponse({ error: "Student login required." }, 403);
    }

    try {
      const saved = await saveDailyNotebook(body, env);
      return jsonResponse({ ok: true, ...saved }, 200, {
        "Cache-Control": "private, no-store",
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Notebook storage is not configured on this server." }, 503);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (code === "DATE_INVALID") {
        return jsonResponse({ error: "Date must be YYYY-MM-DD." }, 400);
      }
      if (code === "DATE_FUTURE") {
        return jsonResponse({ error: "Cannot write a future notebook day." }, 400);
      }
      if (code === "TEXT_TOO_LONG") {
        return jsonResponse({ error: "That note is too long." }, 400);
      }
      console.error("daily-notebook save failed:", err);
      return jsonResponse({ error: "Could not save daily notebook." }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function handleKanjiNotebook(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const allowedTeacher = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const teacherUsername = String(url.searchParams.get("teacherUsername") || "")
    .trim()
    .toLowerCase();
  const isTeacher = teacherUsername === allowedTeacher;

  if (request.method === "GET") {
    let username = String(url.searchParams.get("username") || "")
      .trim()
      .toLowerCase();
    const student = String(url.searchParams.get("student") || "")
      .trim()
      .toLowerCase();
    if (isTeacher && student) username = student;
    if (!username) {
      return jsonResponse({ error: "Student login required." }, 403);
    }

    const page = url.searchParams.get("page");
    try {
      if (!(await isKnownStudent(username, env))) {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      const payload = await getKanjiNotebook(env, {
        username,
        page: page == null || page === "" ? 0 : page,
      });
      return jsonResponse(payload, 200, { "Cache-Control": "private, no-store" });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Notebook storage is not configured on this server." }, 503);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      console.error("kanji-notebook GET failed:", err);
      return jsonResponse({ error: "Could not load kanji notebook." }, 500);
    }
  }

  if (request.method === "PUT" || request.method === "POST") {
    let body: KanjiNotebookSaveInput;
    try {
      body = (await request.json()) as KanjiNotebookSaveInput;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    if (!username) {
      return jsonResponse({ error: "Student login required." }, 403);
    }

    try {
      const saved = await saveKanjiNotebook(body, env);
      return jsonResponse({ ok: true, ...saved }, 200, {
        "Cache-Control": "private, no-store",
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Notebook storage is not configured on this server." }, 503);
      }
      if (code === "UNKNOWN_STUDENT") {
        return jsonResponse({ error: "Unknown student account." }, 403);
      }
      if (code === "TEXT_TOO_LONG") {
        return jsonResponse({ error: "That page is too long." }, 400);
      }
      console.error("kanji-notebook save failed:", err);
      return jsonResponse({ error: "Could not save kanji notebook." }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function handleHomeworkNotebook(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "")
    .trim()
    .toLowerCase();
  if (!username) {
    return jsonResponse({ error: "Student login required." }, 403);
  }

  try {
    const packs = await listHomeworkNotebook(env, { username });
    return jsonResponse({ packs }, 200, { "Cache-Control": "private, no-store" });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Notebook storage is not configured on this server." }, 503);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }
    if (code === "USERNAME_REQUIRED") {
      return jsonResponse({ error: "Student login required." }, 403);
    }
    console.error("homework-notebook failed:", err);
    return jsonResponse({ error: "Could not load notebook." }, 500);
  }
}

async function handleHomeworkReviewAck(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: HomeworkReviewAckInput;
  try {
    body = (await request.json()) as HomeworkReviewAckInput;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  try {
    const existingBefore = await getHomeworkSubmission(env, String(body.submissionId || "").trim());
    const wasAlreadyAcked = existingBefore?.reviewStatus === "acknowledged";
    const ackResult = await saveHomeworkReviewAck(body, env);
    const submission = ackResult.submission;
    const nextHomeworkId = ackResult.nextHomeworkId;
    const webhook = resolveHomeworkWebhook(env);
    if (webhook && !wasAlreadyAcked) {
      const name = submission.displayName || submission.username;
      const lesson =
        submission.lessonName || submission.title || submission.assignmentId || "Homework";
      const result = await notifyDiscord(webhook.url, {
        title: homeworkNotifyHeadline(
          "Student finished reviewing notes",
          name,
          submission.username,
          lesson
        ),
        color: 0x2d6a4f,
        fields: [
          {
            name: "Next",
            value: nextHomeworkId
              ? "Promoted next queued homework: " + nextHomeworkId
              : "Ready for new homework (notes acknowledged).",
            inline: false,
          },
        ],
      });
      if (!result.ok) {
        console.error("homework-review-ack Discord error", result.status, result.detail);
      }
    } else if (!webhook) {
      console.error("homework-review-ack: no Discord webhook configured");
    }

    return jsonResponse(
      { ok: true, submission, nextHomeworkId },
      200,
      { "Cache-Control": "private, no-store" }
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    if (code === "SUBMISSION_REQUIRED" || code === "USERNAME_REQUIRED") {
      return jsonResponse({ error: "Student username and submission id are required." }, 400);
    }
    if (code === "UNKNOWN_STUDENT") {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }
    if (code === "FORBIDDEN") {
      return jsonResponse({ error: "Not allowed for this submission." }, 403);
    }
    if (code === "NOT_FOUND") {
      return jsonResponse({ error: "Submission not found." }, 404);
    }
    if (code === "NOT_ONLINE") {
      return jsonResponse({ error: "Only online worksheet reviews can be acknowledged." }, 400);
    }
    if (code === "NOT_REVIEWED") {
      return jsonResponse({ error: "JD’s notes are not ready yet." }, 400);
    }
    console.error("homework-review-ack failed:", err);
    return jsonResponse({ error: "Could not acknowledge review notes." }, 500);
  }
}

async function handleHomeworkSubmissions(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const studentUsername = String(url.searchParams.get("username") || "")
    .trim()
    .toLowerCase();
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  const isTeacher = teacherUsername.trim().toLowerCase() === allowed;

  if (!isTeacher) {
    if (!studentUsername) {
      return jsonResponse({ error: "Student login required." }, 403);
    }
    if (!(await isKnownStudent(studentUsername, env))) {
      return jsonResponse({ error: "Unknown student account." }, 403);
    }

    try {
      const id = url.searchParams.get("id") || "";
      if (id) {
        const submission = await getHomeworkSubmission(env, id);
        if (!submission) return jsonResponse({ error: "Submission not found." }, 404);
        if (submission.username !== studentUsername) {
          return jsonResponse({ error: "Not allowed." }, 403);
        }
        return jsonResponse({ submission }, 200, { "Cache-Control": "private, no-store" });
      }

      const submissions = await listHomeworkSubmissions(env, { student: studentUsername });
      return jsonResponse({ submissions }, 200, { "Cache-Control": "private, no-store" });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
      }
      console.error("homework-submissions list failed:", err);
      return jsonResponse({ error: "Could not load submissions." }, 500);
    }
  }

  try {
    const id = url.searchParams.get("id") || "";
    if (id) {
      const submission = await getHomeworkSubmission(env, id);
      if (!submission) return jsonResponse({ error: "Submission not found." }, 404);
      return jsonResponse({ submission });
    }

    const student = url.searchParams.get("student") || "";
    const limitRaw = url.searchParams.get("limit");
    const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : NaN;
    const limit =
      Number.isFinite(limitParsed) && limitParsed > 0
        ? Math.min(500, Math.floor(limitParsed))
        : undefined;
    const submissions = await listHomeworkSubmissions(env, { student, limit });
    return jsonResponse({ submissions });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    console.error("homework-submissions list failed:", err);
    return jsonResponse({ error: "Could not load submissions." }, 500);
  }
}

async function handleStudentBirthdays(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  const birthdays = listStudentBirthdaysSorted().map((entry) => ({
    id: entry.id,
    name: entry.name,
    month: entry.month,
    day: entry.day,
    uncertain: !!entry.uncertain,
    note: entry.note || null,
    label: formatBirthdayLabel(entry),
    daysUntil: daysUntilBirthday(entry),
  }));

  return jsonResponse({ birthdays });
}

async function handleHomeworkSubmissionVideo(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = url.searchParams.get("id") || "";
    const loaded = await loadHomeworkSubmissionVideo(teacherUsername, id, env);
    if (!loaded) return jsonResponse({ error: "Video not found." }, 404);

    const download = url.searchParams.get("download") === "1";
    const filename = submissionMediaFilename(loaded.mimeType, loaded.name, id);
    const headers: Record<string, string> = {
      "Content-Type": loaded.mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(loaded.body.byteLength),
      ...CORS_HEADERS,
    };
    if (download) {
      headers["Content-Disposition"] = contentDispositionAttachment(filename);
    }

    return new Response(loaded.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    console.error("homework-submission video failed:", err);
    return jsonResponse({ error: "Could not load video." }, 500);
  }
}

async function handleHomeworkSubmissionPhoto(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const teacherUsername = url.searchParams.get("teacherUsername") || "";
    const id = url.searchParams.get("id") || "";
    const loaded = await loadHomeworkSubmissionPhoto(teacherUsername, id, env);
    if (!loaded) return jsonResponse({ error: "Photo not found." }, 404);

    return new Response(loaded.body, {
      status: 200,
      headers: {
        "Content-Type": loaded.mimeType,
        "Cache-Control": "private, max-age=3600",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Submission storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    console.error("homework-submission photo failed:", err);
    return jsonResponse({ error: "Could not load photo." }, 500);
  }
}

async function handleMgLexicon(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const result = await getMgLexiconPublic(env);
    return jsonResponse(result);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Lexicon storage is not configured." }, 503);
    }
    console.error("mg-lexicon load failed:", err);
    return jsonResponse({ error: "Could not load lookup lexicon." }, 500);
  }
}

async function handleMgGlassCheck(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const state = await getMgGlassCheck(
        { teacherUsername: url.searchParams.get("teacherUsername") || undefined },
        env
      );
      return jsonResponse(state);
    }
    if (request.method === "POST") {
      const data = (await request.json()) as MgGlassCheckPayload;
      const state = await setMgGlassCheck(data, env);
      return jsonResponse({ success: true, ...state });
    }
    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TEACHER_ONLY") return jsonResponse({ error: "Teacher login required." }, 403);
    if (code === "KEYS_REQUIRED") return jsonResponse({ error: "No cards given." }, 400);
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Lexicon storage is not configured." }, 503);
    }
    console.error("mg-glass-check failed:", err);
    return jsonResponse({ error: "Could not save glass check progress." }, 500);
  }
}

async function handleMgLexiconQueue(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  const url = new URL(request.url);
  try {
    const result = await getMgLexiconQueue(
      { teacherUsername: url.searchParams.get("teacherUsername") || undefined },
      env
    );
    return jsonResponse(result);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TEACHER_ONLY") return jsonResponse({ error: "Teacher login required." }, 403);
    console.error("mg-lexicon queue failed:", err);
    return jsonResponse({ error: "Could not load lexicon queue." }, 500);
  }
}

async function handleMgLexiconSubmit(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as MgLexiconSubmitPayload;
    const result = await submitMgLexiconCard(data, env);
    return jsonResponse({
      success: true,
      message: "Rule saved — magnifying glass updated for everyone.",
      remaining: result.remaining,
      version: result.overlay.updatedAt,
      overlay: result.overlay,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TEACHER_ONLY") return jsonResponse({ error: "Teacher login required." }, 403);
    if (code === "CARD_NOT_FOUND") return jsonResponse({ error: "Card not found or already done." }, 404);
    if (code === "CUSTOM_REQUIRED" || code === "MERGE_REQUIRED" || code === "SKIP_REQUIRED") {
      return jsonResponse({ error: "Fill in the required fields before submitting." }, 400);
    }
    console.error("mg-lexicon submit failed:", err);
    return jsonResponse({ error: "Could not save lexicon rule." }, 500);
  }
}

async function handleMgLexiconAddCard(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as MgLexiconAddCardPayload;
    const result = await addMgLexiconCard(data, env);
    return jsonResponse({
      success: true,
      card: result.card,
      pending: result.pending,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TEACHER_ONLY") return jsonResponse({ error: "Teacher login required." }, 403);
    if (code === "SURFACE_REQUIRED") return jsonResponse({ error: "Enter a word or phrase." }, 400);
    console.error("mg-lexicon add-card failed:", err);
    return jsonResponse({ error: "Could not add card." }, 500);
  }
}

async function handleMgLexiconPatch(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as MgLexiconPatchPayload;
    const result = await patchMgLexiconOverlay(data, env);
    return jsonResponse({
      success: true,
      message: "Lookup rule saved.",
      version: result.overlay.updatedAt,
      overlay: result.overlay,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TEACHER_ONLY") return jsonResponse({ error: "Teacher login required." }, 403);
    if (code === "SURFACE_REQUIRED") return jsonResponse({ error: "Word surface is required." }, 400);
    if (code === "PATCH_EMPTY") {
      return jsonResponse({ error: "Enter a reading, definition, or highlight fix." }, 400);
    }
    console.error("mg-lexicon patch failed:", err);
    return jsonResponse({ error: "Could not save lookup rule." }, 500);
  }
}

async function handleMgLexiconSuggestBatch(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const data = (await request.json()) as MgLexiconSuggestBatchPayload;
    const result = await suggestMgLexiconBatch(data, env);
    return jsonResponse({
      success: true,
      added: result.added,
      skipped: result.skipped,
      pending: result.pending,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TEACHER_ONLY") return jsonResponse({ error: "Teacher login required." }, 403);
    console.error("mg-lexicon suggest-batch failed:", err);
    return jsonResponse({ error: "Could not queue lexicon suggestions." }, 500);
  }
}

async function handleLanternWords(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const setId = url.searchParams.get("set") || "demo";
    try {
      const result = await loadLanternWords(setId, env);
      return jsonResponse(result);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "INVALID_SET") {
        return jsonResponse({ error: "Invalid study set." }, 400);
      }
      console.error("lantern-words load failed:", err);
      return jsonResponse({ error: "Could not load word list." }, 500);
    }
  }

  if (request.method === "POST") {
    try {
      const data = (await request.json()) as LanternWordSetSavePayload;
      const result = await saveLanternWords(data, env);
      return jsonResponse({
        success: true,
        message: "Word list saved.",
        setId: result.setId,
        wordCount: result.wordCount,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "KV_NOT_CONFIGURED") {
        return jsonResponse({ error: "Word list storage is not configured on this server." }, 503);
      }
      if (code === "TEACHER_ONLY") {
        return jsonResponse({ error: "Teacher login required." }, 403);
      }
      if (code === "INVALID_SET") {
        return jsonResponse({ error: "Invalid study set id." }, 400);
      }
      if (code === "WORDS_REQUIRED") {
        return jsonResponse({ error: "Add at least one word with a reading." }, 400);
      }
      console.error("lantern-words save failed:", err);
      return jsonResponse({ error: "Could not save word list." }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function handleLanternWordSets(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const sets = await listLanternWordSets(env);
    return jsonResponse({ sets });
  } catch (err) {
    console.error("lantern-word-sets list failed:", err);
    return jsonResponse({ error: "Could not load study sets." }, 500);
  }
}

async function handleLanternWordSetDelete(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const data = (await request.json()) as LanternWordSetDeletePayload;
    const result = await deleteLanternWordSet(data, env);
    return jsonResponse({
      success: true,
      message: "Study set deleted.",
      setId: result.setId,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Word list storage is not configured on this server." }, 503);
    }
    if (code === "TEACHER_ONLY") {
      return jsonResponse({ error: "Teacher login required." }, 403);
    }
    if (code === "BUILTIN_SET") {
      return jsonResponse({ error: "Built-in study sets cannot be deleted." }, 400);
    }
    if (code === "INVALID_SET") {
      return jsonResponse({ error: "Invalid study set id." }, 400);
    }
    console.error("lantern-word-set delete failed:", err);
    return jsonResponse({ error: "Could not delete study set." }, 500);
  }
}

function katakanaToHiragana(text: string): string {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

interface JishoApiEntry {
  japanese?: Array<{ word?: string; reading?: string }>;
  senses?: Array<{ english_definitions?: string[]; parts_of_speech?: string[] }>;
  is_common?: boolean;
}

function pickBestJishoEntry(items: JishoApiEntry[], query: string): JishoApiEntry | null {
  if (!items.length) return null;
  const q = query.trim();
  const score = (entry: JishoApiEntry): number => {
    const word = entry.japanese?.[0]?.word || "";
    const reading = entry.japanese?.[0]?.reading || "";
    let s = 0;
    if (word === q) s += 120;
    if (reading === q) s += 110;
    if (word.length === q.length) s += 60;
    if (word && q.startsWith(word)) s += 20;
    if (word.length === 1 && q.length > 1) s -= 50;
    if (entry.is_common) s += 8;
    const pos = entry.senses?.[0]?.parts_of_speech || [];
    if (q.length > 1 && pos.some((p) => /kana-only|hiragana/i.test(p))) s -= 30;
    return s;
  };
  return [...items].sort((a, b) => score(b) - score(a))[0] || null;
}

async function handleJaLookup(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 48);
  if (!q) return jsonResponse({ error: "Missing q parameter." }, 400);

  const cacheKey = "site:ja-lookup:" + q;
  try {
    const cached = await env.HOMEWORK_KV?.get(cacheKey);
    if (cached) {
      return jsonResponse(JSON.parse(cached), 200, { "Cache-Control": "public, max-age=86400" });
    }
  } catch {
    /* ignore cache read errors */
  }

  const jishoApiUrl =
    "https://jisho.org/api/v1/search/words?keyword=" + encodeURIComponent(q);
  const fetchHeaders = {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(jishoApiUrl, {
        headers:
          attempt > 0
            ? { ...fetchHeaders, Referer: "https://jisho.org/" }
            : fetchHeaders,
      });
      lastStatus = res.status;
      if (!res.ok) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        break;
      }

      const data = (await res.json()) as { data?: JishoApiEntry[] };
      const best = pickBestJishoEntry(data.data || [], q);
      const reading = katakanaToHiragana(best?.japanese?.[0]?.reading || "");
      const definition = (best?.senses?.[0]?.english_definitions || [])
        .slice(0, 3)
        .join(", ");
      const payload = {
        query: q,
        reading,
        definition,
        jishoUrl: "https://jisho.org/search/" + encodeURIComponent(q),
      };

      try {
        await env.HOMEWORK_KV?.put(cacheKey, JSON.stringify(payload), {
          expirationTtl: 60 * 60 * 24 * 30,
        });
      } catch {
        /* ignore cache write errors */
      }

      return jsonResponse(payload, 200, { "Cache-Control": "public, max-age=86400" });
    } catch (err) {
      console.error("ja-lookup attempt failed:", attempt + 1, q, err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
    }
  }

  console.error("ja-lookup upstream status:", lastStatus, q);
  return jsonResponse({ error: "Dictionary lookup failed." }, 502);
}

/**
 * Fetch a static asset via the ASSETS binding (assets.local host per CF docs).
 */
function fetchAsset(request: Request, env: Env, pathname?: string): Promise<Response> {
  const incoming = new URL(request.url);
  const path = pathname || incoming.pathname;
  const assetUrl = new URL(path + incoming.search, "https://assets.local");
  return env.ASSETS.fetch(assetUrl.toString());
}

/** Homework hub shell must never stick on an old deploy at the edge. */
function withFreshHtmlHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function isHomeworkShellPath(pathname: string): boolean {
  return (
    pathname === "/homework" ||
    pathname === "/homework/" ||
    pathname === "/homework.html" ||
    pathname === "/homework/platform" ||
    pathname === "/homework/platform.html"
  );
}

/** True when ASSETS returned a real JSON body (not SPA index.html fallback). */
function isJsonAssetResponse(res: Response): boolean {
  if (!res.ok) return false;
  const ct = (res.headers.get("Content-Type") || "").toLowerCase();
  return ct.includes("application/json") || ct.includes("text/json") || ct.includes("+json");
}

async function spaFallback(_request: Request, _env: Env, assetResponse: Response): Promise<Response> {
  return assetResponse;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Old marketing URL looked like the main Hub entry; always send to login.
    if (
      url.pathname === "/homework-hub" ||
      url.pathname === "/homework-hub/" ||
      url.pathname === "/homework-hub.html"
    ) {
      return Response.redirect(new URL("/homework.html", url.origin).toString(), 301);
    }

    // Early API canaries / hot paths — keep ahead of any asset fallthrough.
    if (url.pathname === "/api/__health") {
      return new Response("worker-ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    if (url.pathname === "/api/homework-assignment") {
      return handleHomeworkAssignment(request, env);
    }

    const hwMediaMatch = url.pathname.match(/^\/api\/hw-m\/([^/]+)$/);
    if (hwMediaMatch) {
      const teacher = (env.HW_TEACHER_USER || "jlm").toLowerCase();
      const target = new URL("/api/homework-submissions/video", request.url);
      target.searchParams.set("id", decodeURIComponent(hwMediaMatch[1]));
      target.searchParams.set("teacherUsername", teacher);
      if (url.searchParams.has("d")) target.searchParams.set("download", "1");
      return handleHomeworkSubmissionVideo(new Request(target.toString(), request), env);
    }

    const hwImgMatch = url.pathname.match(/^\/api\/hw-img\/([^/]+)$/);
    if (hwImgMatch) {
      return handleHomeworkWorksheetImage(request, env);
    }

    if (url.pathname === "/api/homework-worksheet-image-upload") {
      return handleHomeworkWorksheetImageUpload(request, env);
    }

    if (url.pathname === "/api/ja-lookup") {
      return handleJaLookup(request, env);
    }

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    if (url.pathname === "/api/auth/signup") {
      return handleAuthSignup(request, env);
    }

    if (url.pathname === "/api/auth/login") {
      return handleAuthLogin(request, env);
    }

    if (url.pathname === "/api/auth/activate-plan") {
      return handleAuthActivatePlan(request, env);
    }

    if (url.pathname === "/api/auth/update-profile") {
      return handleAuthUpdateProfile(request, env);
    }

    if (url.pathname === "/api/auth/change-password") {
      return handleAuthChangePassword(request, env);
    }

    if (url.pathname === "/api/auth/delete-own-account") {
      return handleAuthDeleteOwnAccount(request, env);
    }

    if (url.pathname === "/api/auth/self-extras") {
      return handleAuthSelfExtras(request, env);
    }

    if (url.pathname === "/api/paypal/create-subscription") {
      return handlePaypalCreateSubscription(request, env);
    }

    if (url.pathname === "/api/auth/delete-account") {
      return handleAuthDeleteAccount(request, env);
    }

    if (url.pathname === "/api/promo-signup") {
      return handlePromoSignup(request, env);
    }

    if (url.pathname === "/api/feature-report") {
      return handleFeatureReport(request, env);
    }

    if (url.pathname === "/api/feature-reports") {
      return handleFeatureReports(request, env);
    }

    if (url.pathname === "/api/feature-report-image") {
      return handleFeatureReportImage(request, env);
    }

    if (url.pathname === "/api/social-reminders") {
      return handleSocialReminders(request, env);
    }

    if (url.pathname === "/api/promo-signups") {
      return handlePromoSignups(request, env);
    }

    if (url.pathname === "/api/promo-signups/delete") {
      return handlePromoSignupDelete(request, env);
    }

    if (url.pathname === "/api/student-birthdays") {
      return handleStudentBirthdays(request, env);
    }

    if (url.pathname === "/api/homework-submit") {
      return handleHomeworkSubmit(request, env);
    }

    if (url.pathname === "/api/homework-review") {
      return handleHomeworkReview(request, env);
    }

    if (url.pathname === "/api/homework-answer-bank") {
      return handleHomeworkAnswerBank(request, env);
    }

    if (url.pathname === "/api/homework-notebook") {
      return handleHomeworkNotebook(request, env);
    }

    if (url.pathname === "/api/daily-notebook") {
      return handleDailyNotebook(request, env);
    }

    if (url.pathname === "/api/kanji-notebook") {
      return handleKanjiNotebook(request, env);
    }

    if (url.pathname === "/api/homework-review-ack") {
      return handleHomeworkReviewAck(request, env);
    }

    if (url.pathname === "/api/homework-draft") {
      return handleHomeworkDraft(request, env);
    }

    if (url.pathname === "/api/homework-comments-draft") {
      return handleHomeworkCommentsDraft(request, env);
    }

    if (url.pathname === "/api/student-mistakes") {
      return handleStudentMistakes(request, env);
    }

    if (url.pathname === "/api/local-dev-mistakes-key") {
      return handleLocalDevMistakesKey(request, env);
    }

    if (url.pathname === "/api/student-mistakes/delete") {
      return handleStudentMistakeDelete(request, env);
    }

    if (url.pathname === "/api/student-mistakes/resolve") {
      return handleStudentMistakeResolve(request, env);
    }

    if (url.pathname === "/api/student-mistakes/restore") {
      return handleStudentMistakeRestore(request, env);
    }

    if (url.pathname === "/api/homework-submissions/discord-preview") {
      return handleHomeworkSubmissionDiscordPreview(request, env);
    }

    if (url.pathname === "/api/homework-submissions") {
      return handleHomeworkSubmissions(request, env);
    }

    if (url.pathname === "/api/homework-submissions/photo") {
      return handleHomeworkSubmissionPhoto(request, env);
    }

    if (url.pathname === "/api/homework-submissions/video") {
      return handleHomeworkSubmissionVideo(request, env);
    }

    if (url.pathname === "/api/homework-photo-upload") {
      return handleHomeworkPhotoUpload(request, env);
    }

    if (url.pathname === "/api/homework-video-upload") {
      return handleHomeworkVideoUpload(request, env);
    }

    if (url.pathname === "/api/homework-audio-upload") {
      return handleHomeworkAudioUpload(request, env);
    }

    if (url.pathname === "/api/homework-review-media-upload") {
      return handleHomeworkReviewMediaUpload(request, env);
    }

    if (url.pathname === "/api/homework-generate") {
      return handleHomeworkGenerate(request, env);
    }

    if (url.pathname === "/api/homework-catalog") {
      return handleHomeworkCatalog(request, env);
    }

    if (url.pathname === "/api/homework-students") {
      return handleHomeworkStudents(request, env);
    }

    if (url.pathname === "/api/homework-publish") {
      return handleHomeworkPublish(request, env);
    }

    if (url.pathname === "/api/homework-student-profile") {
      return handleHomeworkStudentProfile(request, env);
    }

    if (url.pathname === "/api/homework-student-wipe") {
      return handleHomeworkStudentWipe(request, env);
    }

    if (url.pathname === "/api/homework-save-worksheet") {
      return handleHomeworkSaveWorksheet(request, env);
    }

    if (url.pathname === "/api/homework-delete-worksheet") {
      return handleHomeworkDeleteWorksheet(request, env);
    }

    if (url.pathname === "/api/teacher-ideas") {
      return handleTeacherIdeas(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/tags") {
      return handleTeacherIdeaTag(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/tags/delete") {
      return handleTeacherIdeaTagDelete(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/upload-image") {
      return handleTeacherIdeaImageUpload(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/image") {
      return handleTeacherIdeaImage(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/images/delete") {
      return handleTeacherIdeaImageDelete(request, env);
    }

    if (url.pathname === "/api/teacher-ideas/delete") {
      return handleTeacherIdeaDelete(request, env);
    }

    if (url.pathname === "/api/discord-bot-status") {
      return handleDiscordBotStatus(request, env);
    }

    if (url.pathname === "/api/mg-lexicon") {
      return handleMgLexicon(request, env);
    }

    if (url.pathname === "/api/mg-lexicon/queue") {
      return handleMgLexiconQueue(request, env);
    }

    if (url.pathname === "/api/mg-lexicon/submit") {
      return handleMgLexiconSubmit(request, env);
    }

    if (url.pathname === "/api/mg-lexicon/add-card") {
      return handleMgLexiconAddCard(request, env);
    }

    if (url.pathname === "/api/mg-lexicon/patch") {
      return handleMgLexiconPatch(request, env);
    }

    if (url.pathname === "/api/mg-lexicon/suggest-batch") {
      return handleMgLexiconSuggestBatch(request, env);
    }

    if (url.pathname === "/api/mg-glass-check") {
      return handleMgGlassCheck(request, env);
    }

    if (url.pathname === "/api/lantern-words") {
      return handleLanternWords(request, env);
    }

    if (url.pathname === "/api/lantern-words/sets") {
      return handleLanternWordSets(request, env);
    }

    if (url.pathname === "/api/lantern-words/delete-set") {
      return handleLanternWordSetDelete(request, env);
    }

    // Never SPA-fallback /api/* to index.html (assets not_found_handling).
    // Unmatched API routes must stay JSON so clients don't parse homepage HTML.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (isHarrisPreviewPath(url.pathname)) {
      if (!isHarrisPreviewAuthorized(request, env)) {
        return harrisPreviewUnauthorized();
      }
      const assetResponse = await fetchAsset(request, env);
      return withHarrisPreviewHeaders(await spaFallback(request, env, assetResponse));
    }

    if (isJemPreviewPath(url.pathname)) {
      const assetResponse = await fetchAsset(request, env);
      return withJemPreviewHeaders(await spaFallback(request, env, assetResponse));
    }

    if (isHomeworkShellPath(url.pathname)) {
      const shellPath =
        url.pathname === "/homework" || url.pathname === "/homework/"
          ? "/homework.html"
          : url.pathname === "/homework/platform"
            ? "/homework/platform.html"
            : url.pathname;
      const assetResponse = await fetchAsset(request, env, shellPath);
      return withFreshHtmlHeaders(await spaFallback(request, env, assetResponse));
    }

    const assetResponse = await fetchAsset(request, env);
    return spaFallback(request, env, assetResponse);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    if (event.cron === "0 0 * * *") {
      ctx.waitUntil(runBirthdayReminders(env));
    }
    if (event.cron === "* * * * *") {
      ctx.waitUntil(runSocialReminders(env));
      ctx.waitUntil(runHwPlanReminders(env));
    }
  },
};
