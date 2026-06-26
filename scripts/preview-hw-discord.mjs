/**
 * One-off: post a formatted homework preview to Discord using stored submission data.
 * Usage: node scripts/preview-hw-discord.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = "https://japanese-language-mentor.jplang.workers.dev";
const TEACHER = "jlm";

const LISTEN_RE =
  /Listen to the clip and write down what you think it's saying(\s+in Japanese)?\.?/gi;
const TRANSLATE_RE = /Translate into English\.?/gi;

function loadWebhook() {
  const raw = readFileSync(resolve(ROOT, ".dev.vars"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "DISCORD_HOMEWORK_WEBHOOK_URL" && val) return val;
  }
  throw new Error("DISCORD_HOMEWORK_WEBHOOK_URL not found in .dev.vars");
}

function stripInstructions(text) {
  return String(text || "")
    .replace(LISTEN_RE, "")
    .replace(TRANSLATE_RE, "")
    .replace(/___/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStarPieces(raw) {
  const s = String(raw || "").trim();
  if (!s.startsWith("[")) return null;
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.map((p) => String(p || "").trim()).filter(Boolean) : null;
  } catch {
    return null;
  }
}

function normalizeRow(row, index) {
  const blockType = (row.blockType || "").toLowerCase();
  const num = row.progress?.match(/^(\d+)/)?.[1] || String(index + 1);
  let question = stripInstructions(row.question?.trim() || "");
  let answer = stripInstructions(row.student?.trim() || "");
  let piecesLine = row.piecesDisplay?.trim() || "";

  if (!piecesLine) {
    const pieces = parseStarPieces(answer);
    if (pieces) {
      answer = pieces.join("");
      piecesLine = pieces.join(" · ");
    }
  }

  if (blockType === "translation") {
    if (!question && row.prompt) question = stripInstructions(row.prompt);
    if (!question && row.completed) {
      const completed = stripInstructions(row.completed);
      if (completed && answer && completed.endsWith(answer)) {
        question = completed.slice(0, completed.length - answer.length).trim();
      }
    }
  }

  if (blockType === "listening") {
    question = "";
    if (!answer && row.completed) answer = stripInstructions(row.completed);
  }

  if (row.completed && blockType !== "translation") {
    const completed = stripInstructions(row.completed);
    if (completed && answer && completed !== answer && completed.includes(answer)) {
      const maybeQ = completed.replace(answer, "").trim();
      if (maybeQ && blockType !== "listening") question = stripInstructions(maybeQ);
    }
  }

  let mediaLabel = "";
  const mediaId = row.mediaId?.trim() || "";
  if (row.mediaKind || blockType === "video" || blockType === "audio") {
    mediaLabel =
      row.mediaKind === "audio" || blockType === "audio" ? "Audio submitted" : "Video submitted";
    answer = "";
  } else if (!answer) {
    answer = "(blank)";
  }

  return { num, question, answer, piecesLine, mediaLabel, mediaId, mediaKind: row.mediaKind || "" };
}

function formatRow(row, index) {
  const fmt = normalizeRow(row, index);
  const lines = [`${fmt.num}`];
  if (fmt.question) lines.push(`   ${fmt.question}`);
  if (fmt.mediaLabel) {
    lines.push(`   ${fmt.mediaLabel}`);
    if (fmt.mediaId) {
      const listen = `${BASE}/api/homework-submissions/video?id=${encodeURIComponent(fmt.mediaId)}&teacherUsername=${TEACHER}`;
      const download = `${listen}&download=1`;
      lines.push(`   Listen: ${listen}`);
      lines.push(`   Download: ${download}`);
    }
  } else if (fmt.answer) {
    lines.push(`   ${fmt.answer}`);
  }
  if (fmt.piecesLine) lines.push(`   ${fmt.piecesLine}`);
  return lines.join("\n");
}

function mediaUrl(id, download) {
  const url = new URL("/api/homework-submissions/video", BASE);
  url.searchParams.set("id", id);
  url.searchParams.set("teacherUsername", TEACHER);
  if (download) url.searchParams.set("download", "1");
  return url.toString();
}

async function fetchSubmission(id) {
  const res = await fetch(
    `${BASE}/api/homework-submissions?teacherUsername=${TEACHER}&id=${encodeURIComponent(id)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load submission");
  return data.submission;
}

function buildOrderedRows(online, videoSubmission) {
  const listening = (online.listening || []).map((row, i) => ({
    ...row,
    progress: String(i + 1),
    blockType: "Listening",
  }));
  const orders = (online.section2 || [])
    .filter((row) => String(row.student || "").trim().startsWith("["))
    .map((row, i) => ({
      ...row,
      progress: String(listening.length + i + 1),
      blockType: "Order",
    }));
  const translations = (online.section2 || [])
    .filter((row) => !String(row.student || "").trim().startsWith("["))
    .map((row, i) => ({
      ...row,
      progress: String(listening.length + orders.length + i + 1),
      blockType: "Translation",
    }));
  const rows = [...listening, ...orders, ...translations];
  if (videoSubmission?.video?.id) {
    rows.push({
      progress: String(rows.length + 1),
      blockType: "Video",
      student: "Video submitted",
      mediaId: videoSubmission.video.id,
      mediaKind: videoSubmission.video.mimeType?.startsWith("audio/") ? "audio" : "video",
    });
  }
  return rows;
}

async function main() {
  const webhook = loadWebhook();
  const online = await fetchSubmission("sub-1782429296068-7w9ac2");
  const video = await fetchSubmission("sub-1782429269071-hzb1yg");
  const ordered = buildOrderedRows(online, video);

  const student = online.displayName || "Ben M";
  const lesson = online.lessonName || online.assignmentId;
  const body = [
    "[TEST — new submission format preview]",
    `Homework submitted — ${student} (${online.username})`,
    "",
    `Student: ${student}`,
    `Lesson: ${lesson}`,
    online.title?.trim() ? `Worksheet: ${online.title.trim()}` : null,
    "",
    ordered.map((row, i) => formatRow(row, i)).join("\n\n"),
  ]
    .filter((line) => line != null)
    .join("\n");

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: body.slice(0, 2000) }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Discord ${res.status}: ${detail}`);
  }

  console.log("Posted test preview to Discord homework channel.");
  console.log("\n--- Preview ---\n");
  console.log(body);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
