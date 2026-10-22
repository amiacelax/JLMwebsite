"""Thin YouTube Data API v3 wrapper: sign in once, upload unlisted, playlists, edit title/description.

One-time setup (see SETUP.md): put Google's `client_secret.json` in this folder, then run
    python youtube_api.py auth
A browser opens once; the login is saved in token.json and reused forever.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

HERE = Path(__file__).parent
CLIENT_SECRET = HERE / "client_secret.json"
TOKEN = HERE / "token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube"]


def get_service():
    creds = None
    if TOKEN.is_file():
        creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CLIENT_SECRET.is_file():
                raise SystemExit("client_secret.json missing - do the Google setup first (SETUP.md)")
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
            creds = flow.run_local_server(port=0, prompt="consent", login_hint="jdmelody@gmail.com")
        TOKEN.write_text(creds.to_json(), encoding="utf-8")
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def upload(yt, path: Path, title: str, description: str, privacy: str = "unlisted",
           progress=print) -> str:
    """Resumable upload. Returns the video id. Retries transient errors."""
    body = {
        "snippet": {"title": title[:100], "description": description, "categoryId": "27"},  # Education
        "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(str(path), chunksize=32 * 1024 * 1024, resumable=True, mimetype="video/mp4")
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp, last_pct, tries = None, -1, 0
    while resp is None:
        try:
            status, resp = req.next_chunk()
            tries = 0
            if status and int(status.progress() * 100) // 10 != last_pct:
                last_pct = int(status.progress() * 100) // 10
                progress(f"upload {int(status.progress() * 100)}%")
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and tries < 8:
                tries += 1
                time.sleep(2 ** tries)
                continue
            raise
        except (ConnectionError, TimeoutError):
            if tries >= 8:
                raise
            tries += 1
            time.sleep(2 ** tries)
    return resp["id"]


def video_info(yt, video_id: str) -> dict:
    r = yt.videos().list(part="snippet,status,contentDetails,processingDetails", id=video_id).execute()
    return r["items"][0] if r.get("items") else {}


def update_video(yt, video_id: str, title: str | None = None, description: str | None = None) -> None:
    cur = yt.videos().list(part="snippet", id=video_id).execute()["items"][0]["snippet"]
    snippet = {"title": (title or cur["title"])[:100],
               "description": description if description is not None else cur.get("description", ""),
               "categoryId": cur.get("categoryId", "27")}
    yt.videos().update(part="snippet", body={"id": video_id, "snippet": snippet}).execute()


def recent_uploads(yt, count: int = 25) -> list[dict]:
    """Newest uploads on the channel: [{id,title,published}] (used to avoid duplicate uploads)."""
    up = yt.channels().list(part="contentDetails", mine=True).execute()["items"][0][
        "contentDetails"]["relatedPlaylists"]["uploads"]
    items = yt.playlistItems().list(part="snippet", playlistId=up, maxResults=min(50, count)).execute()["items"]
    return [{"id": i["snippet"]["resourceId"]["videoId"], "title": i["snippet"]["title"],
             "published": i["snippet"]["publishedAt"]} for i in items]


def in_playlist(yt, playlist_id: str, video_id: str) -> bool:
    r = yt.playlistItems().list(part="id", playlistId=playlist_id, videoId=video_id).execute()
    return bool(r.get("items"))


def iso_seconds(iso: str) -> float:
    import re
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", iso or "")
    if not m:
        return 0.0
    h, mi, s = (float(x) if x else 0.0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def find_playlist(yt, title: str) -> str | None:
    """Exact (case-insensitive) title match among your playlists."""
    token = None
    while True:
        r = yt.playlists().list(part="snippet", mine=True, maxResults=50, pageToken=token).execute()
        for it in r.get("items", []):
            if it["snippet"]["title"].strip().lower() == title.strip().lower():
                return it["id"]
        token = r.get("nextPageToken")
        if not token:
            return None


def create_playlist(yt, title: str, privacy: str = "unlisted", description: str = "") -> str:
    """Make a new playlist. Returns the playlist id."""
    r = yt.playlists().insert(
        part="snippet,status",
        body={
            "snippet": {"title": title, "description": description or "1-on-1 Custom Lessons"},
            "status": {"privacyStatus": privacy},
        },
    ).execute()
    return r["id"]


def add_to_playlist(yt, playlist_id: str, video_id: str) -> None:
    yt.playlistItems().insert(part="snippet", body={"snippet": {
        "playlistId": playlist_id,
        "resourceId": {"kind": "youtube#video", "videoId": video_id},
    }}).execute()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "auth":
        svc = get_service()
        me = svc.channels().list(part="snippet", mine=True).execute()["items"][0]["snippet"]["title"]
        print("Signed in. Channel:", me)
        pls = svc.playlists().list(part="snippet", mine=True, maxResults=50).execute().get("items", [])
        print("Playlists found:", [p["snippet"]["title"] for p in pls])
    else:
        print(__doc__)
