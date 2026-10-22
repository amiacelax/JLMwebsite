/** Resolve newest-uploaded video in a lesson playlist (unlisted-safe, no API key). */

const FEED = "https://www.youtube.com/feeds/videos.xml?playlist_id=";
const PLAYLIST_PAGE = "https://www.youtube.com/playlist?list=";
const WATCH_PAGE = "https://www.youtube.com/watch?v=";
const INNERTUBE_BROWSE = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";
const INNERTUBE_PLAYER = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CLIENT_VERSION = "2.20240726.00.00";

/**
 * How many items from each end of the playlist to date-check.
 * Playlists may be newest-first, oldest-first, or custom — so both ends matter.
 * Keep this small: Cloudflare IPs often get YouTube bot-blocked under load.
 */
const UPLOAD_DATE_LOOKBACK = 3;

export type PlaylistLatest = {
  videoId: string;
  url: string;
  /** True when at least one real uploadDate was used (not playlist-order guess). */
  dated: boolean;
  title?: string;
};

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
  title?: string;
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
  return collectPlaylistEntriesFromJson(root).map((entry) => entry.videoId);
}

export type PlaylistEntry = { videoId: string; title: string };

function youtubeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const rec = node as Record<string, unknown>;
  if (typeof rec.simpleText === "string") return rec.simpleText;
  if (typeof rec.content === "string") return rec.content;
  if (Array.isArray(rec.runs)) {
    return rec.runs
      .map((run) =>
        run && typeof run === "object" && typeof (run as { text?: string }).text === "string"
          ? (run as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

function pushPlaylistEntry(out: PlaylistEntry[], seen: Set<string>, videoId: unknown, title: string) {
  const id = String(videoId || "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id) || seen.has(id)) return;
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!clean || /unavailable|private video|deleted video/i.test(clean)) return;
  seen.add(id);
  out.push({ videoId: id, title: clean });
}

function collectPlaylistEntriesFromJson(root: unknown): PlaylistEntry[] {
  const out: PlaylistEntry[] = [];
  const seen = new Set<string>();
  const walk = (o: unknown, depth: number) => {
    if (!o || depth > 50) return;
    if (Array.isArray(o)) {
      o.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof o !== "object") return;
    const rec = o as Record<string, unknown>;
    const renderer = rec.playlistVideoRenderer as { videoId?: string; title?: unknown } | undefined;
    if (renderer?.videoId) pushPlaylistEntry(out, seen, renderer.videoId, youtubeText(renderer.title));
    const lockup = rec.lockupViewModel as
      | {
          contentId?: string;
          metadata?: { lockupMetadataViewModel?: { title?: unknown } };
          title?: unknown;
        }
      | undefined;
    if (lockup?.contentId) {
      pushPlaylistEntry(
        out,
        seen,
        lockup.contentId,
        youtubeText(lockup.metadata?.lockupMetadataViewModel?.title) || youtubeText(lockup.title)
      );
    }
    for (const k of Object.keys(rec)) walk(rec[k], depth + 1);
  };
  walk(root, 0);
  return out;
}

function continuationTokenFromJson(root: unknown): string {
  let token = "";
  const walk = (o: unknown, depth: number) => {
    if (!o || depth > 40 || token) return;
    if (Array.isArray(o)) {
      o.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof o !== "object") return;
    const rec = o as Record<string, unknown>;
    const cmd = rec.continuationCommand as { token?: string } | undefined;
    if (cmd?.token) {
      token = cmd.token;
      return;
    }
    for (const k of Object.keys(rec)) walk(rec[k], depth + 1);
  };
  walk(root, 0);
  return token;
}

async function browsePlaylistPage(body: Record<string, unknown>): Promise<{ entries: PlaylistEntry[]; token: string }> {
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
      ...body,
    }),
  });
  if (!res.ok) return { entries: [], token: "" };
  const json = await res.json();
  return { entries: collectPlaylistEntriesFromJson(json), token: continuationTokenFromJson(json) };
}

/** Playlist order, with titles. Unlisted lessons included when the playlist page is reachable. */
export async function fetchPlaylistEntries(playlistId: string): Promise<PlaylistEntry[]> {
  const out: PlaylistEntry[] = [];
  const seen = new Set<string>();
  let token = "";
  for (let page = 0; page < 8; page++) {
    const body = token ? { continuation: token } : { browseId: "VL" + playlistId };
    let pageResult: { entries: PlaylistEntry[]; token: string };
    try {
      pageResult = await browsePlaylistPage(body);
    } catch (err) {
      console.warn("youtube-playlist titles failed:", err);
      break;
    }
    for (const entry of pageResult.entries) {
      if (seen.has(entry.videoId)) continue;
      seen.add(entry.videoId);
      out.push(entry);
    }
    if (!pageResult.token || pageResult.token === token) break;
    token = pageResult.token;
  }
  return out;
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

function ytBrowserHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": BROWSER_UA,
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://www.youtube.com",
    Referer: "https://www.youtube.com/",
    ...(extra || {}),
  };
}

function uploadMsFromPlayerJson(json: unknown): number {
  const root = json as {
    microformat?: {
      playerMicroformatRenderer?: { uploadDate?: string; publishDate?: string };
    };
  };
  const micro = root.microformat?.playerMicroformatRenderer;
  const raw = String(micro?.uploadDate || micro?.publishDate || "").trim();
  return raw ? Date.parse(raw) || 0 : 0;
}

function uploadMsFromWatchHtml(html: string): number {
  const initial = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
  if (initial?.[1]) {
    try {
      const ms = uploadMsFromPlayerJson(JSON.parse(initial[1]));
      if (ms) return ms;
    } catch {
      /* fall through */
    }
  }
  const m =
    html.match(/"uploadDate"\s*:\s*"([^"]+)"/) ||
    html.match(/itemprop="uploadDate"[^>]*content="([^"]+)"/i) ||
    html.match(/itemprop="datePublished"[^>]*content="([^"]+)"/i);
  if (!m?.[1]) return 0;
  return Date.parse(m[1]) || 0;
}

function titleFromPlayerJson(json: unknown): string {
  const root = json as {
    videoDetails?: { title?: string };
    microformat?: { playerMicroformatRenderer?: { title?: { simpleText?: string } } };
  };
  const raw = String(
    root.videoDetails?.title || root.microformat?.playerMicroformatRenderer?.title?.simpleText || ""
  ).trim();
  if (!raw || /unavailable/i.test(raw)) return "";
  return raw.slice(0, 140);
}

/** Innertube player — uploadDate + title for unlisted videos (works even when playback is blocked). */
async function fetchPlayerInfo(videoId: string): Promise<{ ms: number; title: string }> {
  try {
    const res = await fetch(INNERTUBE_PLAYER, {
      method: "POST",
      headers: ytBrowserHeaders({
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": CLIENT_VERSION,
      }),
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: CLIENT_VERSION,
            hl: "en",
            gl: "US",
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });
    if (!res.ok) return { ms: 0, title: "" };
    const json = await res.json();
    return { ms: uploadMsFromPlayerJson(json), title: titleFromPlayerJson(json) };
  } catch {
    return { ms: 0, title: "" };
  }
}

async function fetchWatchUploadMs(videoId: string): Promise<number> {
  try {
    const res = await fetch(WATCH_PAGE + encodeURIComponent(videoId), {
      headers: ytBrowserHeaders({
        Accept: "text/html,application/xhtml+xml",
      }),
    });
    if (!res.ok) return 0;
    return uploadMsFromWatchHtml(await res.text());
  } catch {
    return 0;
  }
}

/** Cap parallel YouTube probes so Workers stay under subrequest / bot limits. */
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function pickNewest(videos: FeedVideo[]): { best: FeedVideo; dated: boolean } | null {
  if (!videos.length) return null;
  let best = videos[0];
  let anyDate = best.publishedMs > 0;
  for (let i = 1; i < videos.length; i++) {
    const v = videos[i];
    if (v.publishedMs > 0) anyDate = true;
    if (v.publishedMs > best.publishedMs) best = v;
  }
  /* No dates — many lesson playlists append newest at the end. */
  if (!anyDate) return { best: videos[videos.length - 1], dated: false };
  return { best, dated: true };
}

/** Candidates from both ends of the playlist. */
function lookbackIds(orderedIds: string[]): string[] {
  if (orderedIds.length <= UPLOAD_DATE_LOOKBACK * 2) return orderedIds;
  const head = orderedIds.slice(0, UPLOAD_DATE_LOOKBACK);
  const tail = orderedIds.slice(-UPLOAD_DATE_LOOKBACK);
  return uniqueOrderedIds([...head, ...tail]);
}

async function resolveFromOrderedIds(
  orderedIds: string[],
  rssById: Map<string, number>
): Promise<PlaylistLatest | null> {
  if (!orderedIds.length) return null;
  const candidates = lookbackIds(orderedIds);
  const dated = await mapPool(candidates, 2, async (videoId) => {
    const info = await fetchPlayerInfo(videoId);
    let publishedMs = info.ms;
    if (!publishedMs) publishedMs = await fetchWatchUploadMs(videoId);
    if (!publishedMs) publishedMs = rssById.get(videoId) || 0;
    return { videoId, publishedMs, title: info.title };
  });
  const picked = pickNewest(dated);
  if (!picked) return null;
  if (!picked.dated) {
    console.warn(
      "youtube-playlist: no upload dates for",
      candidates.length,
      "candidates; falling back to playlist end"
    );
  }
  return {
    videoId: picked.best.videoId,
    url: videoUrlFromId(picked.best.videoId),
    dated: picked.dated,
    title: picked.best.title || "",
  };
}

/**
 * Newest upload in the playlist.
 * Atom RSS only lists public videos — useless for unlisted lesson playlists —
 * so Innertube/HTML order + player uploadDate is the source of truth.
 * `dated: false` means YouTube blocked date reads and we guessed from playlist order.
 */
export async function fetchLatestVideoFromPlaylist(
  playlistUrlOrId: string
): Promise<PlaylistLatest | null> {
  const playlistId = extractPlaylistId(playlistUrlOrId);
  if (!playlistId) {
    const videoId = extractVideoId(playlistUrlOrId);
    if (!videoId) return null;
    return { videoId, url: videoUrlFromId(videoId), dated: true };
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
    const picked = pickNewest(rssVideos);
    if (picked) {
      return {
        videoId: picked.best.videoId,
        url: videoUrlFromId(picked.best.videoId),
        dated: picked.dated,
      };
    }
  }

  return null;
}
