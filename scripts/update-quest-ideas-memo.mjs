/**
 * Find Immersion Quest batch-2 ideas memo in KV and append #21 までの.
 * Run: node scripts/update-quest-ideas-memo.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function wrangler(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function wranglerPut(key, value) {
  const file = path.join(
    os.tmpdir(),
    `jlm-kv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(file, value, "utf8");
  try {
    wrangler(
      `npx wrangler kv key put "${key}" --path="${file}" --binding=HOMEWORK_KV --remote --preview false`
    );
  } finally {
    fs.unlinkSync(file);
  }
}

const listRaw = wrangler(
  "npx wrangler kv key list --binding HOMEWORK_KV --remote --preview false --prefix teacher-idea:"
);
const start = listRaw.indexOf("[");
const keys = JSON.parse(listRaw.slice(start)).map((k) => k.name);

const text = `Immersion Quest — more look-for ideas (batch 2)

Future days after the current 59-cycle. Same format: while watching anime/drama/TV, hunt for…

1. じゃない / じゃないか — casual negation (“isn’t it?”, “it’s not…”)
2. っけ — “was it…?” memory-check ending
3. みたい / みたいな / みたいに — seems like / like / in the manner of
4. らしい — hearsay or “typical of”
5. っぽい — “-ish” vibe (子供っぽい, 関西っぽい)
6. なんか / なんだか — vague “something / somehow”
7. 〜ないで / 〜なくて — without doing / negative te-form links
8. 〜なきゃ / 〜なくちゃ — gotta / have to (casual)
9. 〜てしまう / 〜ちゃう / 〜じゃう — “end up doing” (often regret)
10. 〜たら / 〜たらどう — if / how about if
11. 〜なら — if (given that situation)
12. 〜すぎる — too much
13. 〜やすい / 〜にくい — easy/hard to do
14. 〜中 (ちゅう) — in the middle of (勉強中, 仕事中)
15. Onomatopoeia — ドキドキ, ガチャ, パタパタ, etc.
16. 相槌 (aizuchi) — うん, へえ, そうなんだ, マジで
17. 敬語 vs casual — same scene, spot です・ます vs plain
18. どうして / なぜ / なんで — why (formal vs casual)
19. どちら / どなた — polite question words
20. もっと〜たい — want more / want to more
21. までの — double particle (までの / 〜までの〜)
22. とか — “things like / and so on” (〜とか〜とか)`;

let updated = 0;
for (const key of keys) {
  let raw;
  try {
    raw = wrangler(
      `npx wrangler kv key get "${key}" --binding HOMEWORK_KV --remote --preview false`
    );
  } catch {
    continue;
  }
  if (!raw.includes("Immersion Quest") || !raw.includes("look-for")) continue;
  let idea;
  try {
    idea = JSON.parse(raw);
  } catch {
    continue;
  }
  idea.text = text;
  idea.updatedAt = new Date().toISOString();
  wranglerPut(key, JSON.stringify(idea));
  console.log("Updated", key);
  updated += 1;
}

if (!updated) {
  console.error("No matching Immersion Quest ideas memo found.");
  process.exit(1);
}
