"""Instagram insights for the business account (Instagram API with Instagram Login).

python ig_insights.py check               token works? who am I, followers
python ig_insights.py reels [--limit 25]  Reels: views, reach, likes, saves, shares, avg watch time
python ig_insights.py refresh             renew the 60-day token (run about monthly)
Token lives in .env as INSTAGRAM_TOKEN (never printed).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import settings

API = "https://graph.instagram.com/v23.0"
ENV = Path(__file__).parent / ".env"


def token() -> str:
    t = settings.os.environ.get("INSTAGRAM_TOKEN", "").strip() if hasattr(settings, "os") else ""
    if not t:
        import os
        t = os.environ.get("INSTAGRAM_TOKEN", "").strip()
    if not t:
        raise SystemExit("INSTAGRAM_TOKEN missing in .env")
    return t


def get(path: str, **params) -> dict:
    params["access_token"] = token()
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"Instagram said {e.code}: {body[:400]}") from None


def check() -> None:
    me = get("me", fields="user_id,username,account_type,followers_count,follows_count,media_count")
    print(json.dumps(me, ensure_ascii=False, indent=1))


def reels(limit: int) -> None:
    media = get("me/media", fields="id,caption,media_product_type,media_type,permalink,timestamp,like_count,comments_count",
                limit=limit)["data"]
    print("posted     | views | reach | likes | saves | shares | comm | avg watch s | caption")
    for m in media:
        if m.get("media_product_type") != "REELS":
            continue
        ins = {}
        try:
            data = get(f"{m['id']}/insights", metric="views,reach,saved,shares,likes,comments,ig_reels_avg_watch_time")["data"]
            ins = {d["name"]: d["values"][0]["value"] for d in data}
        except RuntimeError as e:
            ins = {"err": str(e)[:60]}
        cap = re.sub(r"\s+", " ", (m.get("caption") or ""))[:50]
        w = ins.get("ig_reels_avg_watch_time")
        print(f"{m['timestamp'][:10]} | {ins.get('views', '?'):>5} | {ins.get('reach', '?'):>5} | {ins.get('likes', '?'):>5} | "
              f"{ins.get('saved', '?'):>5} | {ins.get('shares', '?'):>6} | {ins.get('comments', '?'):>4} | "
              f"{(w / 1000 if w else 0):>11.1f} | {cap}")


def refresh() -> None:
    url = "https://graph.instagram.com/refresh_access_token?" + urllib.parse.urlencode(
        {"grant_type": "ig_refresh_token", "access_token": token()})
    with urllib.request.urlopen(url, timeout=60) as r:
        new = json.loads(r.read().decode("utf-8"))
    text = ENV.read_text(encoding="utf-8")
    text = re.sub(r"(?m)^INSTAGRAM_TOKEN=.*$", "INSTAGRAM_TOKEN=" + new["access_token"], text)
    ENV.write_text(text, encoding="utf-8")
    print(f"Renewed. Good for another {new.get('expires_in', 0) // 86400} days.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "reels", "refresh"])
    ap.add_argument("--limit", type=int, default=25)
    a = ap.parse_args()
    {"check": check, "reels": lambda: reels(a.limit), "refresh": refresh}[a.cmd]()
    sys.exit(0)
