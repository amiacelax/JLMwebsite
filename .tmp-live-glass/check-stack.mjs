import fs from "fs";
import { execSync } from "child_process";

execSync(
  'curl.exe -fsSL "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html" -o ".tmp-live-glass/hub-v5-preview.html"',
  { stdio: "inherit" }
);
execSync(
  'curl.exe -fsSL "https://japanese-language-mentor.jplang.workers.dev/js/hw-mg-lexicon-suggest.js" -o ".tmp-live-glass/hw-mg-lexicon-suggest.js"',
  { stdio: "inherit" }
);
execSync(
  'curl.exe -fsSL "https://japanese-language-mentor.jplang.workers.dev/css/hw-magnifying-glass.css" -o ".tmp-live-glass/hw-magnifying-glass.css"',
  { stdio: "inherit" }
);

function scripts(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
}

const live = fs.readFileSync(".tmp-live-glass/hub-v5-preview.html", "utf8");
const local = fs.readFileSync("public/homework/hub-v5-preview.html", "utf8");
const re = /mg-|magnifying|worksheet-tools|furigana|hub-v5/;
const liveS = scripts(live).filter((s) => re.test(s));
const localS = scripts(local).filter((s) => re.test(s));
console.log("LIVE", liveS);
console.log("LOCAL", localS);
console.log("script stack equal", JSON.stringify(liveS) === JSON.stringify(localS));

function cmp(a, b) {
  const A = fs.readFileSync(a);
  const B = fs.readFileSync(b);
  console.log(a, "vs local", Buffer.compare(A, B) === 0 ? "MATCH" : "DIFF", A.length, B.length);
}
cmp(".tmp-live-glass/hw-mg-lexicon-suggest.js", "public/js/hw-mg-lexicon-suggest.js");
cmp(".tmp-live-glass/hw-magnifying-glass.css", "public/css/hw-magnifying-glass.css");
cmp(".tmp-live-glass/hw-mg-lexicon.js", "public/js/hw-mg-lexicon.js");
cmp(".tmp-live-glass/hw-magnifying-glass.js", "public/js/hw-magnifying-glass.js");
