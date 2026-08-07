/** Probe YouTube playlist resolution paths (RSS, HTML, innertube). */
const playlistId = "PLWim1UU6-V6DSessOuPE75EKWeAFW5Cyq";

async function tryRss() {
  const res = await fetch(
    "https://www.youtube.com/feeds/videos.xml?playlist_id=" + playlistId,
    { headers: { "User-Agent": "JapaneseLanguageMentor-HomeworkHub/1.0" } }
  );
  const text = await res.text();
  const ids = [...text.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map((m) => m[1]);
  return { status: res.status, count: ids.length, first: ids[0], last: ids[ids.length - 1], hasXCc: ids.includes("XCc-mFtzVZQ") };
}

async function tryHtml() {
  const res = await fetch("https://www.youtube.com/playlist?list=" + playlistId, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const html = await res.text();
  const ids = [...html.matchAll(/"contentId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
  const uniq = [...new Set(ids)];
  return {
    status: res.status,
    bytes: html.length,
    count: uniq.length,
    first: uniq[0],
    last: uniq[uniq.length - 1],
    hasXCc: uniq.includes("XCc-mFtzVZQ"),
  };
}

async function tryInnertube() {
  const browseId = "VL" + playlistId;
  const res = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": "2.20240726.00.00",
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240726.00.00",
          hl: "en",
          gl: "US",
        },
      },
      browseId,
    }),
  });
  const json = await res.json();
  const ids = [];
  const seen = new Set();
  const walk = (o, d = 0) => {
    if (!o || d > 40) return;
    if (Array.isArray(o)) return o.forEach((x) => walk(x, d + 1));
    if (typeof o !== "object") return;
    const id = o.lockupViewModel?.contentId || o.playlistVideoRenderer?.videoId;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    for (const k of Object.keys(o)) walk(o[k], d + 1);
  };
  walk(json);
  return {
    status: res.status,
    count: ids.length,
    first: ids[0],
    last: ids[ids.length - 1],
    hasXCc: ids.includes("XCc-mFtzVZQ"),
  };
}

console.log("rss", await tryRss());
console.log("html", await tryHtml());
console.log("innertube", await tryInnertube());
