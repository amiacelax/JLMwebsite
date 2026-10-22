/**
 * Log mistakes found in a lesson transcript to the Homework Hub (Lessons/Mistakes tab) and ping JD on Discord.
 *
 *   node scripts/log-lesson-mistakes.mjs path/to/mistakes.json [--dry]
 *
 * File format (UTF-8 JSON):
 * {
 *   "student": "baranymatthewjr",          // hub username
 *   "lessonName": "Matt 5",
 *   "mistakes": [
 *     { "category": "particle", "text": "what the student said", "correction": "what it should be", "context": "[12:05] short note" }
 *   ]
 * }
 */
import fs from "node:fs";

const BASE = process.env.JLM_BASE || "https://japaneselanguagementor.com";
const file = process.argv[2];
const dry = process.argv.includes("--dry");
if (!file) {
  console.error("Usage: node scripts/log-lesson-mistakes.mjs mistakes.json [--dry]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const student = String(data.student || "").trim().toLowerCase();
const lessonName = String(data.lessonName || "").trim();
const list = Array.isArray(data.mistakes) ? data.mistakes : [];
if (!student || !list.length) {
  console.error("Need student + at least one mistake.");
  process.exit(1);
}

const saved = [];
for (const m of list) {
  const body = {
    teacherUsername: "jlm",
    studentUsername: student,
    category: m.category || "grammar",
    text: m.text,
    correction: m.correction || undefined,
    context: m.context || undefined,
    source: "lesson",
    lessonName: lessonName || undefined,
  };
  if (dry) {
    console.log("dry:", JSON.stringify(body));
    continue;
  }
  const res = await fetch(`${BASE}/api/student-mistakes`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  console.log(res.status, out.error || out.message || "ok", "-", m.text);
  if (res.ok) saved.push(m);
}

if (!dry && saved.length) {
  const lines = saved.map(
    (m) => `• [${m.category || "grammar"}] ${m.text}${m.correction ? " → " + m.correction : ""}`
  );
  const content = [
    `Mistakes logged for ${student}${lessonName ? " — " + lessonName : ""} (${saved.length}):`,
    ...lines,
    "",
    "See them in the Lessons/Mistakes tab.",
  ].join("\n");
  const res = await fetch(`${BASE}/api/student-mistakes/digest`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ teacherUsername: "jlm", content }),
  });
  console.log("digest", res.status, JSON.stringify(await res.json().catch(() => ({}))));
}
