import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const key = "teacher-idea:idea-1787156347520";
const line = '22. とか — “things like / and so on” (〜とか〜とか)';

function wrangler(cmd) {
  return execSync(cmd, { encoding: "utf8" });
}

const raw = wrangler(
  `npx wrangler kv key get "${key}" --binding HOMEWORK_KV --remote --preview false`
);
const idea = JSON.parse(raw);
if (idea.text.includes("とか —")) {
  console.log("already has とか");
  process.exit(0);
}
idea.text = idea.text.trimEnd() + "\n" + line;
idea.updatedAt = new Date().toISOString();
const file = path.join(os.tmpdir(), `jlm-kv-${Date.now()}.json`);
fs.writeFileSync(file, JSON.stringify(idea), "utf8");
try {
  wrangler(
    `npx wrangler kv key put "${key}" --path="${file}" --binding HOMEWORK_KV --remote --preview false`
  );
} finally {
  fs.unlinkSync(file);
}
console.log("Added", line);
