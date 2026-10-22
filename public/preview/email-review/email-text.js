"use strict";
var JLMEmail = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/student-email-text.ts
  var student_email_text_exports = {};
  __export(student_email_text_exports, {
    EMAIL_COPY: () => EMAIL_COPY,
    buildCancellationEmail: () => buildCancellationEmail,
    buildStudentHomeworkEmail: () => buildStudentHomeworkEmail
  });
  var EMAIL_COPY = {
    common: {
      greeting: "{name}\u3055\u3093\n\n\u304A\u75B2\u308C\u69D8\u3067\u3059\u3002",
      signoff: "\u3088\u308D\u3057\u304F\u304A\u9858\u3044\u3057\u307E\u3059\u3002\n\n\u2014 JD",
      org: "",
      /* Every "Click here" becomes a link to the Notifications page in Account Settings. */
      whyNoDiscord: "Want to receive these notifications via Discord instead? Click here.\nWant to turn all notifications off? Click here",
      whyOptedIn: "",
      ignore: ""
    },
    reviewed: {
      subject: "I finished reviewing your homework: {title}",
      subjectNoTitle: "JD finished reviewing your homework",
      headline: "Homework Reviewed",
      lead: "I finished reviewing your homework {title}.",
      leadNoTitle: "JD finished reviewing your homework.",
      after: "",
      button: "See JD's notes"
    },
    queued: {
      subject: "Your next homework is ready: {title}",
      subjectNoTitle: "Your next homework is ready",
      headline: "Your next homework is ready",
      lead: "I set up your next homework {title}.",
      leadNoTitle: "I set up your next homework.",
      after: "It opens as soon as you finish the one you are working on now.",
      button: "Open Homework Hub"
    },
    assigned: {
      subject: "New homework from JD: {title}",
      subjectNoTitle: "New homework from JD",
      headline: "New homework from JD",
      lead: "I just sent you new homework {title}.",
      leadNoTitle: "I just sent you new homework.",
      after: "Open the Homework Hub whenever you are ready.",
      button: "Start my homework"
    },
    cancelled: {
      subject: "Your Homework Hub subscription is cancelled",
      headline: "Your subscription is cancelled",
      lead: "Your {plan} is cancelled. You will not be charged again.",
      afterDate: "Your plan stays active until {date}.",
      afterNoDate: "Your plan stays active until the end of the period you already paid for.",
      rejoin: "Changed your mind? Log in and pick a plan any time.",
      button: "Open Homework Hub",
      why: "You are getting this email because you cancelled your subscription in your Homework Hub Account Settings. If this was not you, reply to this email."
    }
  };
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fill(template, vars) {
    return String(template || "").replace(/<p>\s*<\/p>/gi, "\n\n").replace(
      /\{(\w+)\}/g,
      (_m, key) => Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ""
    );
  }
  function multiline(s) {
    return esc(s).replace(/\r?\n/g, "<br>");
  }
  function footerHtml(text, url) {
    const link = '<a href="' + esc(url) + '" style="color:#1f6f9f;">Click here</a>';
    return multiline(text).replace(/Click here/g, link);
  }
  var DEFAULT_SETTINGS_URL = "https://japaneselanguagementor.com/homework/platform.html#account-notifications";
  var HTML_OUTER = "background:#f4f1ea;padding:24px 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;";
  var HTML_CARD = "max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 26px;color:#1a2744;line-height:1.55;";
  var HTML_BUTTON = "display:inline-block;background:#1f6f9f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;";
  function wrapHtml(parts) {
    const shown = parts.paragraphs.filter((p) => String(p.text || "").trim());
    const paras = shown.map(
      (p, i) => '<p style="margin:0 0 ' + (i === shown.length - 1 ? "22" : "12") + "px;" + (p.bold ? "font-weight:600;" : "") + '">' + esc(p.text) + "</p>"
    ).join("");
    return '<div style="' + HTML_OUTER + '"><div style="' + HTML_CARD + '">' + (parts.org ? '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5a6478;">' + esc(parts.org) + "</p>" : "") + '<h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:#1a2744;">' + esc(parts.headline) + '</h1><p style="margin:0 0 20px;">' + multiline(parts.greeting) + '</p><p style="margin:0 0 6px;"><a href="' + esc(parts.loginUrl) + '" style="' + HTML_BUTTON + '">' + esc(parts.button) + "</a></p>" + paras + '<p style="margin:0 0 ' + (parts.org ? "4" : "20") + 'px;">' + multiline(parts.signoff) + "</p>" + (parts.org ? '<p style="margin:0 0 20px;color:#5a6478;">' + esc(parts.org) + "</p>" : "") + (parts.footer.trim() ? '<hr style="border:none;border-top:1px solid #e3e0d8;margin:0 0 14px;"><p style="margin:0;font-size:12.5px;line-height:1.7;color:#5a6478;">' + footerHtml(parts.footer, parts.settingsUrl) + "</p>" : "") + "</div></div>";
  }
  function buildStudentHomeworkEmail(input, copy = EMAIL_COPY) {
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
    const text = greeting + "\n\n" + input.loginUrl + "\n\n" + [lead, after].filter((s) => s.trim()).join("\n") + "\n\n" + [signoff, common.org].filter(Boolean).join("\n") + "\n" + (footer ? "\n" + footer.replace(/Click here/g, "Click here (" + settingsUrl + ")") + "\n" : "");
    const html = wrapHtml({
      headline,
      greeting,
      paragraphs: [{ text: lead }, { text: after }],
      button: c.button,
      loginUrl: input.loginUrl,
      signoff,
      org: common.org,
      footer,
      settingsUrl
    });
    return { subject, text, html };
  }
  function buildCancellationEmail(input, copy = EMAIL_COPY) {
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
    const text = greeting + "\n\n" + lead + "\n" + after + "\n" + rejoin + "\n\n" + input.loginUrl + "\n\n" + [fill(common.signoff, vars), common.org].filter(Boolean).join("\n") + "\n\n" + c.why + "\n";
    const html = wrapHtml({
      headline: fill(c.headline, vars),
      greeting,
      paragraphs: [{ text: lead }, { text: after, bold: true }, { text: rejoin }],
      button: c.button,
      loginUrl: input.loginUrl,
      signoff: fill(common.signoff, vars),
      org: common.org,
      footer: c.why,
      settingsUrl: DEFAULT_SETTINGS_URL
    });
    return { subject: fill(c.subject, vars), text, html };
  }
  return __toCommonJS(student_email_text_exports);
})();
