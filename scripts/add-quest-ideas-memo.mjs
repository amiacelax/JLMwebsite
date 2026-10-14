import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROD_URL =
  "https://japanese-language-mentor.jplang.workers.dev/api/teacher-ideas?teacherUsername=jlm";

function wranglerPut(key, value) {
  const file = path.join(
    os.tmpdir(),
    `jlm-kv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
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

const now = new Date().toISOString();
const id = `idea-${Date.now()}`;

const text = `Immersion Quest — 20 more look-for ideas (batch 2)

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
20. もっと〜たい — want more / want to more`;

const idea = {
  id,
  text,
  tags: ["hw"],
  images: [],
  createdAt: now,
  updatedAt: now,
};

const prod = await fetch(PROD_URL).then((r) => r.json());
const index = [id, ...(prod.ideas || []).map((item) => item.id).filter((x) => x !== id)];

wranglerPut(`teacher-idea:${id}`, JSON.stringify(idea));
wranglerPut("teacher-ideas-index", JSON.stringify(index));

console.log(`Added ${id} to production Ideas & memos (${index.length} total).`);
