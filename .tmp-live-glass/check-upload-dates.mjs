import fs from "fs";

async function uploadDate(videoId) {
  const res = await fetch("https://www.youtube.com/watch?v=" + videoId, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();
  const m =
    html.match(/"uploadDate":"([^"]+)"/) ||
    html.match(/itemprop="uploadDate"[^>]*content="([^"]+)"/) ||
    html.match(/<meta itemprop="datePublished" content="([^"]+)"/);
  const title = html.match(/"title":"([^"]{1,80})"/);
  return { videoId, uploadDate: m?.[1] || null, title: title?.[1] || null, status: res.status };
}

const ids = ["XCc-mFtzVZQ", "FJNcyei2ctg"];
// also pull last 5 from playlist html videoIds order of appearance unique keeping order
const html = fs.readFileSync(process.env.TEMP + "/yt-pl.html", "utf8");
const all = [...html.matchAll(/"contentId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
const ordered = [...new Set(all)];
console.log("ordered count", ordered.length, "first", ordered[0], "last", ordered[ordered.length - 1]);
const sample = [...new Set([...ordered.slice(-5), ...ids])];
for (const id of sample) {
  console.log(await uploadDate(id));
}
