#!/usr/bin/env node
/**
 * Arm a Shorts/Reels Discord + Teacher Hub ping on Cloudflare.
 *
 * Usage:
 *   node scripts/arm-social-reminder.mjs --fire 2026-08-06T01:30:00Z --titles "Want Disneyland? hoshii vs -tai"
 *   node scripts/arm-social-reminder.mjs --list
 *   node scripts/arm-social-reminder.mjs --cancel sr-123
 *
 * Optional:
 *   --pin "..."
 *   --story "Free trial ↑"
 *   --link "https://japaneselanguagementor.com/#contact"
 *   --base https://japaneselanguagementor.com
 *   --user jlm
 */
import process from "node:process";

const DEFAULT_BASE = "https://japaneselanguagementor.com";
const DEFAULT_USER = "jlm";
const DEFAULT_PIN =
  "Free trial Japanese lesson → https://japaneselanguagementor.com/#contact";
const DEFAULT_STORY = "Free trial ↑";
const DEFAULT_LINK = "https://japaneselanguagementor.com/#contact";

function usage() {
  console.log(`Arm Shorts/Reels social reminder (Cloudflare Worker + KV)

  node scripts/arm-social-reminder.mjs --fire <ISO-UTC> --titles "<clip title>"
  node scripts/arm-social-reminder.mjs --list
  node scripts/arm-social-reminder.mjs --cancel <id>

Options:
  --fire   ISO time (UTC or with offset), e.g. 2026-08-06T01:30:00Z
  --titles Clip title(s) shown in the ping
  --pin    YouTube pin comment text
  --story  IG Story caption (default: Free trial ↑)
  --link   Link sticker URL
  --base   API base URL (default: ${DEFAULT_BASE})
  --user   Teacher username (default: ${DEFAULT_USER})
`);
}

function parseArgs(argv) {
  const out = {
    fire: null,
    titles: null,
    pin: DEFAULT_PIN,
    story: DEFAULT_STORY,
    link: DEFAULT_LINK,
    base: DEFAULT_BASE,
    user: DEFAULT_USER,
    list: false,
    cancel: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--list") out.list = true;
    else if (a === "--fire") out.fire = next();
    else if (a === "--titles") out.titles = next();
    else if (a === "--pin") out.pin = next();
    else if (a === "--story") out.story = next();
    else if (a === "--link") out.link = next();
    else if (a === "--base") out.base = next();
    else if (a === "--user") out.user = next();
    else if (a === "--cancel") out.cancel = next();
    else throw new Error(`Unknown arg: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const base = args.base.replace(/\/$/, "");

  if (args.list) {
    const url = `${base}/api/social-reminders?teacherUsername=${encodeURIComponent(args.user)}`;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("LIST failed", res.status, body);
      process.exit(1);
    }
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  if (args.cancel) {
    const url = `${base}/api/social-reminders?teacherUsername=${encodeURIComponent(args.user)}&id=${encodeURIComponent(args.cancel)}`;
    const res = await fetch(url, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("CANCEL failed", res.status, body);
      process.exit(1);
    }
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  if (!args.fire || !args.titles) {
    usage();
    process.exit(1);
  }

  const fireAt = new Date(args.fire);
  if (Number.isNaN(fireAt.getTime())) {
    console.error("Invalid --fire datetime:", args.fire);
    process.exit(1);
  }

  const payload = {
    teacherUsername: args.user,
    fireAtUtc: fireAt.toISOString(),
    clipTitles: args.titles,
    ytPinComment: args.pin,
    igStoryCaption: args.story,
    linkSticker: args.link,
  };

  const res = await fetch(`${base}/api/social-reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("ARM failed", res.status, body);
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
