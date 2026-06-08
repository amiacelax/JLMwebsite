import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCAL_URL = "http://127.0.0.1:8787/api/teacher-ideas?teacherUsername=jlm";
const PROD_URL =
  "https://japanese-language-mentor.jplang.workers.dev/api/teacher-ideas?teacherUsername=jlm";

function wranglerPut(key, value) {
  const file = path.join(os.tmpdir(), `jlm-kv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, value, "utf8");
  try {
    execSync(
      `npx wrangler kv key put "${key}" --path="${file}" --binding=HOMEWORK_KV --remote --preview false`,
      { stdio: "pipe", encoding: "utf8" }
    );
  } finally {
    fs.unlinkSync(file);
  }
}

const localRes = await fetch(LOCAL_URL);
if (!localRes.ok) {
  console.error("Local dev not reachable. Run: npm run dev");
  process.exit(1);
}
const local = await localRes.json();
const prod = await fetch(PROD_URL).then((r) => r.json());

const prodIds = new Set((prod.ideas || []).map((idea) => idea.id));
let copied = 0;

for (const idea of local.ideas || []) {
  if (prodIds.has(idea.id)) continue;
  wranglerPut(`teacher-idea:${idea.id}`, JSON.stringify(idea));
  prodIds.add(idea.id);
  copied += 1;
  console.log(`Copied ${idea.id}`);
}

const byId = new Map();
for (const idea of [...(prod.ideas || []), ...(local.ideas || [])]) {
  byId.set(idea.id, idea);
}
const merged = [...byId.values()].sort((a, b) =>
  String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))
);
const mergedIndex = merged.map((idea) => idea.id);
const mergedCustomTags = [
  ...new Set([...(local.customTags || []), ...(prod.customTags || [])]),
].sort();

wranglerPut("teacher-ideas-index", JSON.stringify(mergedIndex));
wranglerPut("teacher-ideas-custom-tags", JSON.stringify(mergedCustomTags));

console.log(`Done. Copied ${copied} new ideas. Production now has ${mergedIndex.length} ideas.`);
