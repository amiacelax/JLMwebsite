/** Resolve newest-uploaded video in a lesson playlist (unlisted-safe, no API key). */

const FEED = "https://www.youtube.com/feeds/videos.xml?playlist_id=";
const PLAYLIST_PAGE = "https://www.youtube.com/playlist?list=";
const WATCH_PAGE = "https://www.youtube.com/watch?v=";
const INNERTUBE_BROWSE = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CLIENT_VERSION = "2.20240726.00.00";

/** How many trailing playlist items to date-check for true upload time. */
const UPLOAD_DATE_LOOKBACK = 8;

export function extractPlaylistId(raw: string): string | null {
  const url = String(raw || "").trim();
  if (!url) return null;
  const fromQuery = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (fromQuery) return fromQuery[1];
  if (/^PL[a-zA-Z0-9_-]+$/.test(url)) return url;
  return null;
}

export function extractVideoId(raw: string): string | null {
  const url = String(raw || "").trim();
  if (!url) return null;
  const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (short) return short[1];
  const watch = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watch) return watch[1];
  const embed = url.match(/youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{6,})/i);
  if (embed) return embed[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

export function videoUrlFromId(videoId: string): string {
  return `https://youtu.be/${videoId}`;
}

interface FeedVideo {
  videoId: string;
  publishedMs: number;
}

function uniqueOrderedIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function collectVideoIdsFromJson(root: unknown): string[] {
  const ids: string[] = [];
  const walk = (o: unknown, depth: number) => {
    if (!o || depth > 50) return;
    if (Array.isArray(o)) {
      o.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof o !== "object") return;
    const rec = o as Record<string, unknown>;
    const lockup = rec.lockupViewModel as { contentId?: string } | undefined;
    const renderer = rec.playlistVideoRenderer as { videoId?: string } | undefined;
    if (lockup?.contentId) ids.push(lockup.contentId);
    if (renderer?.videoId) ids.push(renderer.videoId);
    for (const k of Object.keys(rec)) walk(rec[k], depth + 1);
  };
  walk(root, 0);
  return uniqueOrderedIds(ids);
}

function videosFromFeedXml(xml: string): FeedVideo[] {
  const videos: FeedVideo[] = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let entryMatch = entryRe.exec(xml);
  while (entryMatch) {
    const body = entryMatch[1] || "";
    const idMatch = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
    const videoId = idMatch?.[1]?.trim();
    if (!videoId) {
      entryMatch = entryRe.exec(xml);
      continue;
    }
    const publishedMatch = body.match(/<published>([^<]+)<\/published>/i);
    const publishedMs = publishedMatch ? Date.parse(publishedMatch[1].trim()) || 0 : 0;
    videos.push({ videoId, publishedMs });
    entryMatch = entryRe.exec(xml);
  }
  return videos;
}

async function fetchRssPlaylistVideos(playlistId: string): Promise<FeedVideo[]> {
  try {
    const res = await fetch(FEED + encodeURIComponent(playlistId), {
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "JapaneseLanguageMentor-HomeworkHub/1.0",
      },
    });
    if (!res.ok) {
      console.warn("youtube-playlist feed", res.status, playlistId);
      return [];
    }
    return videosFromFeedXml(await res.text());
  } catch (err) {
    console.warn("youtube-playlist feed failed:", err);
    return [];
  }
}

/** Innertube browse — includes unlisted videos when the playlist link is reachable. */
export async function fetchPlaylistVideoIdsViaInnertube(playlistId: string): Promise<string[]> {
  try {
    const res = await fetch(INNERTUBE_BROWSE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": BROWSER_UA,
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": CLIENT_VERSION,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: CLIENT_VERSION,
            hl: "en",
            gl: "US",
          },
        },
        browseId: "VL" + playlistId,
      }),
    });
    if (!res.ok) {
      console.warn("youtube-playlist innertube", res.status, playlistId);
      return [];
    }
    return collectVideoIdsFromJson(await res.json());
  } catch (err) {
    console.warn("youtube-playlist innertube failed:", err);
    return [];
  }
}

/** HTML playlist page fallback (also includes unlisted when reachable). */
export async function fetchPlaylistVideoIds(playlistId: string): Promise<string[]> {
  try {
    const res = await fetch(PLAYLIST_PAGE + encodeURIComponent(playlistId), {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      console.warn("youtube-playlist page", res.status, playlistId);
      return [];
    }
    const html = await res.text();
    const fromContentId = [...html.matchAll(/"contentId":"([a-zA-Z0-9_-]{11})"/g)].map(
      (m) => m[1]
    );
    const ids = uniqueOrderedIds(fromContentId);
    if (ids.length) return ids;

    const fromRenderer = [
      ...html.matchAll(
        /"playlistVideoRenderer"\s*:\s*\{[^{}]*?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g
      ),
    ].map((m) => m[1]);
    return uniqueOrderedIds(fromRenderer);
  } catch (err) {
    console.warn("youtube-playlist page failed:", err);
    return [];
  }
}

async function fetchWatchUploadMs(videoId: string): Promise<number> {
  try {
    const res = await fetch(WATCH_PAGE + encodeURIComponent(videoId), {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return 0;
    const html = await res.text();
    const m =
      html.match(/"uploadDate"\s*:\s*"([^"]+)"/) ||
      html.match(/itemprop="uploadDate"[^>]*content="([^"]+)"/i) ||
      html.match(/itemprop="datePublished"[^>]*content="([^"]+)"/i);
    if (!m?.[1]) return 0;
    return Date.parse(m[1]) || 0;
  } catch {
    return 0;
  }
}

function pickNewest(videos: FeedVideo[]): FeedVideo | null {
  if (!videos.length) return null;
  let best = videos[0];
  let anyDate = best.publishedMs > 0;
  for (let i = 1; i < videos.length; i++) {
    const v = videos[i];
    if (v.publishedMs > 0) anyDate = true;
    if (v.publishedMs > best.publishedMs) best = v;
  }
  /* No dates — lesson playlists append newest at the end. */
  if (!anyDate) return videos[videos.length - 1];
  return best;
}

async function resolveFromOrderedIds(
  orderedIds: string[],
  rssById: Map<string, number>
): Promise<{ videoId: string; url: string } | null> {
  if (!orderedIds.length) return null;
  const lookback = orderedIds.slice(-UPLOAD_DATE_LOOKBACK);
  const dated: FeedVideo[] = await Promise.all(
    lookback.map(async (videoId) => {
      let publishedMs = rssById.get(videoId) || 0;
      /* RSS often omits unlisted lessons — always prefer watch-page uploadDate. */
      if (!publishedMs || lookback.length <= UPLOAD_DATE_LOOKBACK) {
        const watchMs = await fetchWatchUploadMs(videoId);
        if (watchMs) publishedMs = watchMs;
      }
      return { videoId, publishedMs };
    })
  );
  const best = pickNewest(dated);
  if (!best) return null;
  return { videoId: best.videoId, url: videoUrlFromId(best.videoId) };
}

/**
 * Newest upload in the playlist.
 * Atom RSS only lists public videos — useless for unlisted lesson playlists —
 * so Innertube/HTML order + watch-page uploadDate is the source of truth.
 */
export async function fetchLatestVideoFromPlaylist(
  playlistUrlOrId: string
): Promise<{ videoId: string; url: string } | null> {
  const playlistId = extractPlaylistId(playlistUrlOrId);
  if (!playlistId) {
    const videoId = extractVideoId(playlistUrlOrId);
    if (!videoId) return null;
    return { videoId, url: videoUrlFromId(videoId) };
  }

  const [innertubeIds, htmlIds, rssVideos] = await Promise.all([
    fetchPlaylistVideoIdsViaInnertube(playlistId),
    fetchPlaylistVideoIds(playlistId),
    fetchRssPlaylistVideos(playlistId),
  ]);

  /* Prefer the longest id list — RSS is usually just the public marketing video. */
  const orderedIds =
    innertubeIds.length >= htmlIds.length && innertubeIds.length > 0
      ? innertubeIds
      : htmlIds.length
        ? htmlIds
        : [];

  const rssById = new Map(rssVideos.map((v) => [v.videoId, v.publishedMs]));

  if (orderedIds.length) {
    const resolved = await resolveFromOrderedIds(orderedIds, rssById);
    if (resolved) return resolved;
  }

  /* RSS-only last resort (public videos only). */
  if (rssVideos.length) {
    const best = pickNewest(rssVideos);
    if (best) return { videoId: best.videoId, url: videoUrlFromId(best.videoId) };
  }

  return null;
}
