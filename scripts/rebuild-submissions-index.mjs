/**
 * Rebuild submissions-index from per-student indexes (recover after dedupe).
 * Also finish any remaining same-student+sheet+type duplicates.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STUDENTS = [
  "benc",
  "benm",
  "daiki",
  "deme",
  "demoprem",
  "drew",
  "faye",
  "garywgipson",
  "ivan",
  "joshs",
  "kaetherjk",
  "sgtjamjar",
  "sykohpath",
];

function wrangler(args) {
  return execSync(`npx wrangler ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
}

function kvGet(key) {
  const out = wrangler(
    `kv key get "${key}" --binding=HOMEWORK_KV --remote --preview false`
  );
  // Strip wrangler noise — value is last JSON-ish line or whole trim
  const text = String(out || "").trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith("[") || line.startsWith("{") || line.startsWith('"')) {
      return line;
    }
  }
  return text;
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
  } catch (err) {
    console.warn("delete fail", key, err?.message || err);
  }
}

function kvGetJson(key) {
  const raw = kvGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("parse fail", key, raw.slice(0, 80));
    return null;
  }
}

const allIds = [];
for (const user of STUDENTS) {
  const ids = kvGetJson(`submissions-by-student:${user}`);
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  console.log(user, list.length);
  for (const id of list) allIds.push(id);
}

const uniqueIds = [...new Set(allIds)];
console.log("union student indexes", uniqueIds.length);

const submissions = [];
for (const id of uniqueIds) {
  const s = kvGetJson(`submission:${id}`);
  if (s && s.id) submissions.push(s);
  else console.warn("missing body", id);
}

console.log("loaded submissions", submissions.length);

const groups = new Map();
for (const s of submissions) {
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

const keep = [];
const del = [];
for (const [, arr] of groups) {
  arr.sort((a, b) =>
    String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))
  );
  keep.push(arr[0]);
  for (let i = 1; i < arr.length; i++) del.push(arr[i]);
}

console.log("keep", keep.length, "delete", del.length);

for (const s of del) {
  console.log("DEL", s.id, s.username, s.type, s.assignmentId, s.submittedAt);
  kvDelete(`submission:${s.id}`);
  kvDelete(`submission-photo:${s.id}`);
  kvDelete(`submission-photo-meta:${s.id}`);
  kvDelete(`submission-video:${s.id}`);
  kvDelete(`submission-video-meta:${s.id}`);
}

const keepIds = keep.map((s) => s.id);
// Newest first in global index
keepIds.sort((a, b) => {
  const sa = keep.find((x) => x.id === a);
  const sb = keep.find((x) => x.id === b);
  return String(sb?.submittedAt || "").localeCompare(String(sa?.submittedAt || ""));
});

kvPut("submissions-index", JSON.stringify(keepIds));
console.log("wrote submissions-index", keepIds.length);

const byUser = new Map();
for (const s of keep) {
  const u = String(s.username || "")
    .trim()
    .toLowerCase();
  if (!u) continue;
  if (!byUser.has(u)) byUser.set(u, []);
  byUser.get(u).push(s);
}

for (const [user, arr] of byUser) {
  arr.sort((a, b) =>
    String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))
  );
  const ids = arr.map((s) => s.id);
  kvPut(`submissions-by-student:${user}`, JSON.stringify(ids));
  console.log("wrote student index", user, ids.length);
}

// Clear student indexes for users with no kept submissions but old index entries
for (const user of STUDENTS) {
  if (byUser.has(user)) continue;
  const existing = kvGetJson(`submissions-by-student:${user}`);
  if (Array.isArray(existing) && existing.length) {
    kvPut(`submissions-by-student:${user}`, JSON.stringify([]));
    console.log("cleared empty student index", user);
  }
}

console.log("Done rebuild.");
