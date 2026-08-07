import fs from "fs";

const html = fs.readFileSync(process.env.TEMP + "/yt-pl.html", "utf8");
console.log("has XCc", html.includes("XCc-mFtzVZQ"));
console.log("has FJN", html.includes("FJNcyei2ctg"));
console.log("has playlistVideoRenderer", html.includes("playlistVideoRenderer"));
console.log("has ytInitialData", html.includes("ytInitialData"));

const ids = [...html.matchAll(/"videoId":"([^"]+)"/g)].map((x) => x[1]);
const uniq = [...new Set(ids)];
console.log("unique videoIds", uniq.length);
console.log("sample", uniq.slice(0, 15));
console.log("XCc in ids", uniq.includes("XCc-mFtzVZQ"));
console.log("FJN in ids", uniq.includes("FJNcyei2ctg"));

const marker = "ytInitialData";
const i = html.indexOf(marker);
if (i < 0) process.exit(0);
let start = html.indexOf("{", i);
let depth = 0;
let end = -1;
for (let p = start; p < html.length; p++) {
  const ch = html[p];
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) {
      end = p + 1;
      break;
    }
  }
}
if (end < 0) {
  console.log("could not brace-match ytInitialData");
  process.exit(0);
}
const data = JSON.parse(html.slice(start, end));
const vids = [];
function walk(o, depth = 0) {
  if (!o || depth > 40) return;
  if (Array.isArray(o)) {
    o.forEach((x) => walk(x, depth + 1));
    return;
  }
  if (typeof o !== "object") return;
  if (o.playlistVideoRenderer) {
    const r = o.playlistVideoRenderer;
    vids.push({
      id: r.videoId,
      title: r.title?.runs?.[0]?.text || r.title?.simpleText || "",
      pub: r.videoInfo?.runs?.map((x) => x.text).join("") || r.publishedTimeText?.simpleText || "",
      idx: r.index?.simpleText,
    });
    return;
  }
  for (const k of Object.keys(o)) walk(o[k], depth + 1);
}
walk(data);
console.log("renderer count", vids.length);
console.log(
  "hits",
  vids.filter((v) => v.id === "XCc-mFtzVZQ" || v.id === "FJNcyei2ctg")
);
console.log("first3", vids.slice(0, 3));
console.log("last3", vids.slice(-3));
