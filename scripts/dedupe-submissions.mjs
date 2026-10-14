/**
 * One-off: delete duplicate homework submissions in production KV.
 * Duplicate key = username + assignmentId + type. Keep newest submittedAt.
 *
 * Usage: node scripts/dedupe-submissions.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API =
  "https://japaneselanguagementor.com/api/homework-submissions?teacherUsername=jlm";

function wrangler(args) {
  return execSync(`npx wrangler ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function kvGet(key) {
  const out = wrangler(
    `kv key get "${key}" --binding=HOMEWORK_KV --remote --preview false`
  );
  return String(out || "").trim();
}

function kvPut(key, value) {
  const file = path.join(
    os.tmpdir(),
    `jlm-kv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(file, value, "utf8");
  try {
    wrangler(
      `kv key put "${key}" --path="${file}" --binding=HOMEWORK_KV --remote --preview false`
    );
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function kvDelete(key) {
  try {
    wrangler(
      `kv key delete "${key}" --binding=HOMEWORK_KV --remote --preview false`
    );
    return true;
  } catch (err) {
    console.warn("delete failed", key, err?.message || err);
    return false;
  }
}

const data = await fetch(API).then((r) => r.json());
const list = Array.isArray(data.submissions) ? data.submissions : [];
const groups = new Map();

for (const s of list) {
  const key = [
    String(s.username || "")
      .trim()
      .toLowerCase(),
    String(s.assignmentId || "").trim(),
    String(s.type || "").trim(),
  ].join("||");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s);
}

const keepIds = new Set();
const deleteIds = [];
const affectedUsers = new Set();

for (const [key, arr] of groups) {
  arr.sort((a, b) =>
    String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))
  );
  const [keep, ...rest] = arr;
  if (keep?.id) keepIds.add(keep.id);
  for (const s of rest) {
    if (!s?.id) continue;
    deleteIds.push({
      id: s.id,
      username: String(s.username || "")
        .trim()
        .toLowerCase(),
      label: `${s.displayName || s.username} · ${s.type} · ${s.lessonName || s.title || s.assignmentId}`,
      submittedAt: s.submittedAt,
    });
    if (s.username) affectedUsers.add(String(s.username).trim().toLowerCase());
  }
  if (rest.length) {
    console.log(
      `KEEP ${keep.id} (${key}) · drop ${rest.length}`
    );
  }
}

console.log(`\nWill delete ${deleteIds.length} duplicates; keep ${keepIds.size} unique newest.\n`);

for (const row of deleteIds) {
  console.log(`DEL ${row.id} · ${row.label} · ${row.submittedAt}`);
  kvDelete(`submission:${row.id}`);
  kvDelete(`submission-photo:${row.id}`);
  kvDelete(`submission-photo-meta:${row.id}`);
  kvDelete(`submission-video:${row.id}`);
  kvDelete(`submission-video-meta:${row.id}`);
}

/* Global index */
let globalIndex = [];
try {
  globalIndex = JSON.parse(kvGet("submissions-index") || "[]");
  if (!Array.isArray(globalIndex)) globalIndex = [];
} catch {
  globalIndex = list.map((s) => s.id).filter(Boolean);
}
const deleteSet = new Set(deleteIds.map((d) => d.id));
const nextGlobal = globalIndex.filter((id) => !deleteSet.has(id));
kvPut("submissions-index", JSON.stringify(nextGlobal));
console.log(`\nUpdated submissions-index: ${globalIndex.length} → ${nextGlobal.length}`);

/* Per-student indexes */
for (const user of affectedUsers) {
  const key = `submissions-by-student:${user}`;
  let ids = null;
  try {
    const raw = kvGet(key);
    if (raw) ids = JSON.parse(raw);
  } catch {
    ids = null;
  }
  if (!Array.isArray(ids)) {
    ids = list
      .filter((s) => String(s.username || "").toLowerCase() === user)
      .map((s) => s.id)
      .filter(Boolean);
  }
  const next = ids.filter((id) => !deleteSet.has(id));
  kvPut(key, JSON.stringify(next));
  console.log(`Updated ${key}: ${ids.length} → ${next.length}`);
}

console.log("\nDone.");
