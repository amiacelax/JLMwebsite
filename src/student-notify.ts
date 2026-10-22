/**
 * Tell a student about homework: Discord DM first, plus an email when
 *  - they have no Discord ID, or the Discord DM did not go through, or
 *  - they turned Email notifications on in Account Settings.
 * JD (the teacher) is still told through the existing Discord path.
 * Never throws.
 */

import { notifyHw } from "./discord-channels";
import {
  normalizeDiscordUserId,
  notifyStudentWithTeacherFallback,
  type DiscordNotifyEnv,
  type DiscordNotifyResult,
} from "./discord-notify";
import { getStudentContact, getStudentNotifyPrefs } from "./homework-kv";
import {
  outboundEmailConfigured,
  sendOutboundEmail,
  type InquiryEmailEnv,
} from "./notify-email";
import {
  buildStudentHomeworkEmail,
  type StudentEmailKind,
  type StudentEmailReason,
} from "./student-email-text";

export type StudentEmailStatus =
  | "sent"
  | "failed"
  | "no_email_on_account"
  | "email_not_configured"
  | "not_needed";

/**
 * Master switch for the homework emails. On: students with no Discord ID entered get an email.
 */
export const STUDENT_HOMEWORK_EMAIL_ENABLED = true;

type NotifyEnv = DiscordNotifyEnv & InquiryEmailEnv & { HOMEWORK_KV?: KVNamespace };

export async function notifyStudentHomework(
  env: NotifyEnv,
  opts: {
    studentUsername: string;
    discordUserId?: string | null;
    studentContent: string;
    /** Message for JD when the student's Discord DM was attempted. */
    teacherContent: string;
    /** Message for JD when there is no Discord ID; gets a short note about the email. */
    teacherContentNoDiscord: (emailNote: string) => string;
    copyTeacherOnStudentDm?: boolean;
    teacherCopyContent?: string;
    email: {
      kind: StudentEmailKind;
      title: string;
      loginUrl: string;
    };
  }
): Promise<DiscordNotifyResult & { email: StudentEmailStatus }> {
  const kv = env.HOMEWORK_KV;
  const hasDiscordId = Boolean(normalizeDiscordUserId(opts.discordUserId));

  let wantsEmailPref = false;
  let contact = { email: "", displayName: "" };
  if (kv) {
    try {
      wantsEmailPref = (await getStudentNotifyPrefs(kv, opts.studentUsername)).email === true;
      contact = await getStudentContact(kv, opts.studentUsername);
    } catch (err) {
      console.error("student-notify lookup failed:", err);
    }
  }

  let emailStatus: StudentEmailStatus = "not_needed";
  const sendEmail = async (reason: StudentEmailReason): Promise<StudentEmailStatus> => {
    if (!STUDENT_HOMEWORK_EMAIL_ENABLED) return "not_needed";
    if (!contact.email) return "no_email_on_account";
    if (!outboundEmailConfigured(env)) return "email_not_configured";
    try {
      const body = buildStudentHomeworkEmail({
        kind: opts.email.kind,
        name: contact.displayName,
        title: opts.email.title,
        loginUrl: opts.email.loginUrl,
        reason,
      });
      const sent = await sendOutboundEmail(env, {
        to: contact.email,
        subject: body.subject,
        text: body.text,
        html: body.html,
      });
      if (!sent.ok) {
        console.error("student homework email failed", opts.studentUsername, sent);
        return "failed";
      }
      return "sent";
    } catch (err) {
      console.error("student homework email error:", err);
      return "failed";
    }
  };

  const noteFor = (s: StudentEmailStatus): string => {
    if (s === "sent") return "Emailed the student instead (" + contact.email + ").";
    if (s === "failed") return "Tried to email the student but it failed.";
    if (s === "no_email_on_account") return "No email on their account either, so they have not been told.";
    if (s === "email_not_configured") return "Email sending is not set up, so they have not been told.";
    return "";
  };

  /* No Discord ID: email first so JD's message can say what happened. */
  if (!hasDiscordId) {
    emailStatus = await sendEmail("no_discord");
  }

  const discord = await notifyStudentWithTeacherFallback(env, {
    studentUsername: opts.studentUsername,
    discordUserId: opts.discordUserId,
    studentContent: opts.studentContent,
    teacherContent: hasDiscordId
      ? opts.teacherContent
      : opts.teacherContentNoDiscord(noteFor(emailStatus)),
    copyTeacherOnStudentDm: false,
    teacherCopyContent: opts.teacherCopyContent,
    skipTeacherNotify: true,
  });

  /* JD hears homework pings in HW-notifications, not a DM. Student DMs stay. */
  const tellJd =
    !hasDiscordId || discord.mode !== "student_dm" || opts.copyTeacherOnStudentDm === true;
  if (tellJd) {
    let teacherText = hasDiscordId
      ? opts.teacherCopyContent || opts.teacherContent
      : opts.teacherContentNoDiscord(noteFor(emailStatus));
    if (hasDiscordId && discord.mode !== "student_dm") {
      teacherText +=
        "\n(Also: student DM failed — " + (discord.detail || "unknown") + ")";
    }
    try {
      await notifyHw(env, teacherText);
    } catch (err) {
      console.error("student-notify hw channel failed:", err);
    }
  }

  /* Has a Discord ID: Discord only for now. To also email when a DM fails or the student opted in, add:
       if (discord.mode !== "student_dm") sendEmail("no_discord"); else if (wantsEmailPref) sendEmail("opted_in"); */
  void wantsEmailPref;

  return { ...discord, email: emailStatus };
}
