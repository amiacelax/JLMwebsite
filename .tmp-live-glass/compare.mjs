import fs from "fs";
import { execSync } from "child_process";

function load(p) {
  return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}
function fromGit(path) {
  return execSync("git show HEAD:" + path, { encoding: "buffer" }).toString("utf8").replace(/\r\n/g, "\n");
}

const liveLex = load(".tmp-live-glass/hw-mg-lexicon.js");
const liveMg = load(".tmp-live-glass/hw-magnifying-glass.js");
const headLex = fromGit("public/js/hw-mg-lexicon.js");
const headMg = fromGit("public/js/hw-magnifying-glass.js");
const localLex = load("public/js/hw-mg-lexicon.js");
const localMg = load("public/js/hw-magnifying-glass.js");

function fnBody(src, name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n  \\}\\n");
  const m = src.match(re);
  return m ? m[0] : null;
}

console.log("--- live pickQuickUnit ---");
console.log(fnBody(liveLex, "pickQuickUnit"));
console.log("--- HEAD pickQuickUnit ---");
console.log(fnBody(headLex, "pickQuickUnit"));

const markers = (label, lex, mg) => {
  console.log(label, {
    skipWin: lex.includes("Skip cards always win"),
    distLeft: lex.includes("distLeft"),
    ambiguous: lex.includes("AMBIGUOUS_BOUNDARY"),
    attach: lex.includes("QUICK_ATTACH_SUFFIXES"),
    expandStrict: mg.includes("No lexicon unit at this caret"),
    fallbackSkip: mg.includes("FALLBACK_SKIP_SURFACE"),
    awaitEnsure: /await global\.HwMgLexicon\?\.ensureLoaded/.test(mg),
    expandOldWhile: /while \(start > 0 && JA_CHAR\.test/.test(mg),
  });
};

markers("live", liveLex, liveMg);
markers("HEAD", headLex, headMg);
markers("local", localLex, localMg);

console.log("liveLex===headLex", liveLex === headLex);
console.log("liveMg===headMg", liveMg === headMg);
console.log("localLex===liveLex", localLex === liveLex);
console.log("localMg===liveMg", localMg === liveMg);

// Diff summary live vs HEAD for lexicon using simple line counts
function changedHunks(a, b) {
  const al = a.split("\n");
  const bl = b.split("\n");
  let i = 0;
  const max = Math.max(al.length, bl.length);
  let diffs = 0;
  for (; i < max; i++) if (al[i] !== bl[i]) diffs++;
  return { linesLive: al.length, linesOther: bl.length, differingLinesApprox: diffs };
}
console.log("live vs HEAD lex", changedHunks(liveLex, headLex));
console.log("live vs HEAD mg", changedHunks(liveMg, headMg));
console.log("live vs local lex", changedHunks(liveLex, localLex));
console.log("live vs local mg", changedHunks(liveMg, localMg));
