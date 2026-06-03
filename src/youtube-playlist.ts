/** Resolve newest video in a public YouTube playlist via the Atom RSS feed (no API key). */

const FEED = "https://www.youtube.com/feeds/videos.xml?playlist_id=";

export function extractPlaylistId(raw: string): string | null {
  const url = String(raw || "").trim();
  if (!url) return null;
  const fromQuery = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (fromQuery) return fromQuery[1];
  if (/^PL[a-zA-Z0-9_-]+$/.test(url)) return url;
  return null;
}

export function videoUrlFromId(videoId: string): string {
  return `https://youtu.be/${videoId}`;
}

function videoIdsFromFeedXml(xml: string): string[] {
  const ids: string[] = [];
  const re = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
  let match = re.exec(xml);
  while (match) {
    const id = match[1]?.trim();
    if (id) ids.push(id);
    match = re.exec(xml);
  }
  return ids;
}

/**
 * Last video in the playlist RSS feed (matches playlist order: newest upload at the bottom).
 */
export async function fetchLatestVideoFromPlaylist(
  playlistUrlOrId: string
): Promise<{ videoId: string; url: string } | null> {
  const playlistId = extractPlaylistId(playlistUrlOrId);
  if (!playlistId) return null;

  try {
    const res = await fetch(FEED + encodeURIComponent(playlistId), {
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "JapaneseLanguageMentor-HomeworkHub/1.0",
      },
    });
    if (!res.ok) {
      console.warn("youtube-playlist feed", res.status, playlistId);
      return null;
    }
    const xml = await res.text();
    const ids = videoIdsFromFeedXml(xml);
    const videoId = ids.length ? ids[ids.length - 1] : null;
    if (!videoId) return null;
    return { videoId, url: videoUrlFromId(videoId) };
  } catch (err) {
    console.warn("youtube-playlist fetch failed:", err);
    return null;
  }
}
