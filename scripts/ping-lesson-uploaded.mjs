#!/usr/bin/env node
/**
 * Tell a student their lesson is on YouTube.
 *   node scripts/ping-lesson-uploaded.mjs --user baranymatthewjr --title "Matt 5" --video b5c90SJzQ_0
 */
const BASE = process.env.JLM_BASE || "https://japaneselanguagementor.com";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || "" : "";
}

const studentUsername = arg("--user").trim().toLowerCase();
const title = arg("--title").trim();
const videoId = arg("--video").trim();
if (!studentUsername) {
  console.error("Need --user <hub username>");
  process.exit(1);
}

const res = await fetch(BASE + "/api/lesson-uploaded", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ teacherUsername: "jlm", studentUsername, title, videoId }),
});
const out = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(out));
if (!res.ok) process.exit(1);
