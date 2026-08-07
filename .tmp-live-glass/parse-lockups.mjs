import fs from "fs";

const html = fs.readFileSync(process.env.TEMP + "/yt-pl.html", "utf8");
const marker = "ytInitialData";
const i = html.indexOf(marker);
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
const data = JSON.parse(html.slice(start, end));
const vids = [];

function walk(o, d = 0) {
  if (!o || d > 50) return;
  if (Array.isArray(o)) {
    o.forEach((x) => walk(x, d + 1));
    return;
  }
  if (typeof o !== "object") return;
  if (o.lockupViewModel?.contentId || o.lockupViewModel?.contentImage) {
    const l = o.lockupViewModel;
    const id =
      l.contentId ||
      l.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url?.match(/\/vi\/([^/]+)\//)?.[1];
    const title =
      l.metadata?.lockupMetadataViewModel?.title?.content ||
      l.metadata?.title?.content ||
      "";
    const metaRows =
      l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ||
      [];
    const metaText = JSON.stringify(metaRows);
    vids.push({ id, title: String(title).slice(0, 80), meta: metaText.slice(0, 200) });
    return;
  }
  for (const k of Object.keys(o)) walk(o[k], d + 1);
}
walk(data);
console.log("lockups", vids.length);
const hit = vids.filter((v) => v.id === "XCc-mFtzVZQ" || v.id === "FJNcyei2ctg");
console.log(JSON.stringify(hit, null, 2));
console.log("first", vids[0]);
console.log("last", vids[vids.length - 1]);

// Also dump nearby keys for one lockup
function findLockup(o, d = 0) {
  if (!o || d > 50) return null;
  if (Array.isArray(o)) {
    for (const x of o) {
      const f = findLockup(x, d + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof o !== "object") return null;
  if (o.lockupViewModel?.contentId === "XCc-mFtzVZQ") return o.lockupViewModel;
  for (const k of Object.keys(o)) {
    const f = findLockup(o[k], d + 1);
    if (f) return f;
  }
  return null;
}
const sample = findLockup(data);
fs.writeFileSync(process.env.TEMP + "/xcc-lockup.json", JSON.stringify(sample, null, 2));
console.log("wrote xcc-lockup.json keys", sample && Object.keys(sample));
