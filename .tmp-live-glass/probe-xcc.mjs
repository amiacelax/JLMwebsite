import fs from "fs";

const html = fs.readFileSync(process.env.TEMP + "/yt-pl.html", "utf8");
const idx = html.indexOf("XCc-mFtzVZQ");
console.log("idx", idx);
console.log(html.slice(Math.max(0, idx - 400), idx + 600));

// Find renderer-like keys near video ids
const keys = new Set();
for (const m of html.matchAll(/"([a-zA-Z]+Renderer)"\s*:/g)) keys.add(m[1]);
console.log("renderers", [...keys].sort().slice(0, 40));
