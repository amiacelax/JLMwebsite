"""YouTube Analytics (watch time, retention, subscribers) - read-only, separate login from uploads.

python yt_analytics.py auth                 one-time sign-in (jdmelody@gmail.com)
python yt_analytics.py report [--days 28]   top videos: views, watch time, avg % watched, likes, subs gained
python yt_analytics.py shorts [--days 28]   same but only short videos (<= 3 min)
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

HERE = Path(__file__).parent
CLIENT_SECRET = HERE / "client_secret.json"
TOKEN = HERE / "token_analytics.json"
SCOPES = ["https://www.googleapis.com/auth/yt-analytics.readonly",
          "https://www.googleapis.com/auth/youtube.readonly"]


def creds() -> Credentials:
    c = None
    if TOKEN.is_file():
        c = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
        if c.expired and c.refresh_token:
            c.refresh(Request())
            TOKEN.write_text(c.to_json(), encoding="utf-8")
    if not c or not c.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
        c = flow.run_local_server(port=0, prompt="consent", login_hint="jdmelody@gmail.com")
        TOKEN.write_text(c.to_json(), encoding="utf-8")
    return c


def report(days: int, shorts_only: bool = False) -> None:
    c = creds()
    an = build("youtubeAnalytics", "v2", credentials=c)
    yt = build("youtube", "v3", credentials=c)
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    r = an.reports().query(
        ids="channel==MINE", startDate=start.isoformat(), endDate=end.isoformat(),
        metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained",
        dimensions="video", sort="-views", maxResults=50).execute()
    rows = r.get("rows", [])
    ids = [x[0] for x in rows]
    info = {}
    for i in range(0, len(ids), 50):
        for v in yt.videos().list(part="snippet,contentDetails,statistics", id=",".join(ids[i:i + 50])).execute()["items"]:
            info[v["id"]] = v
    import re
    def secs(iso: str) -> int:
        m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
        return int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
    print(f"{start} -> {end}  ({'Shorts' if shorts_only else 'all videos'})")
    print("views(live) | views(analytics, lags 1-2 days) | min watched | avg % watched | likes | shares | subs+ | title")
    for x in rows:
        v = info.get(x[0])
        if not v:
            continue
        if shorts_only and secs(v["contentDetails"]["duration"]) > 180:
            continue
        print(f"{int(v['statistics'].get('viewCount', 0)):>6} | {x[1]:>5} | {x[2]:>11} | {x[4]:>12.0f}% | {x[5]:>5} | {x[7]:>6} | {x[8]:>5} | {v['snippet']['title'][:70]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["auth", "report", "shorts"])
    ap.add_argument("--days", type=int, default=28)
    a = ap.parse_args()
    if a.cmd == "auth":
        creds()
        print("Signed in. Saved token_analytics.json")
    else:
        report(a.days, a.cmd == "shorts")
    sys.exit(0)

