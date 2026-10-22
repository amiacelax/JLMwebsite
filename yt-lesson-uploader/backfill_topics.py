"""Title + timestamp lessons already on YouTube (anything in a student playlist), newest first, going backwards.

usage: python backfill_topics.py [--days 1000] [--until 16:35] [--dry]
  --until HH:MM   don't START a new lesson after this local time (each takes ~20-25 min), then send one summary message.
Resumable: transcripts are cached in work/, finished videos are noted in state/backfill.json.

Rules:
  * your own title (e.g. "Josh 46 ～ないといけない") is KEPT - only timestamps are added to the description
  * no topic in the title ("Ben M 3") -> "Ben M 3 - topic" + timestamps
  * existing description (count line, footer, anything else) is kept; the timestamp block goes under the "n/total" line
  * lesson 0, titles without a lesson number, and videos that already have good timestamps are skipped
  * timestamps that look wrong (all inside the first 2 minutes of a long lesson) are redone
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import lesson_transcribe as lt
import metadata
import settings
import students
import youtube_api as y
from settings import log

DONE = settings.STATE_JSON.parent / "backfill.json"
TMP = settings.WORK / "_backfill"
TITLE_RE = re.compile(r"^(.+?)[\s\u3000]+(\d+)(?:[\s\u3000]*(.*))?$", re.S)
STAMP_RE = re.compile(r"^\s*(\d+):(\d\d)(?::(\d\d))?\s+\S")
COUNT_RE = re.compile(r"^\+?(\d+)(?:\+\d+)?(?:/(\d+))?(?:\s*\(.*\))?$")


SKIP_NAMES = ("drew", "deme", "daiki", "reia", "reya")          # JD: ignore these students
SKIP_WORDS = ("練習", "自主練", "体育館", "chris catchup")
KNOWN = {s["key"] for s in students.load()["students"]}


def is_lesson(title: str, desc: str, duration: float) -> bool:
    low = title.lower()
    if duration < 1200 or any(low.startswith(n) or f" {n}" in low[:30] for n in SKIP_NAMES):
        return False
    if any(w in low for w in SKIP_WORDS):
        return False
    return "1-on-1 Custom Lessons" in desc or bool(COUNT_RE.match((desc.splitlines() or [""])[0].strip()))


def listing(yt, days: int) -> list[dict]:
    cut = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    up = yt.channels().list(part="contentDetails", mine=True).execute()["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    ids, tok = [], None
    while True:
        r = yt.playlistItems().list(part="contentDetails", playlistId=up, maxResults=50, pageToken=tok).execute()
        ids += [i["contentDetails"]["videoId"] for i in r["items"]]
        tok = r.get("nextPageToken")
        if not tok:
            break
    out = []
    for i in range(0, len(ids), 50):
        v = yt.videos().list(part="snippet,contentDetails", id=",".join(ids[i:i + 50])).execute()
        for x in v["items"]:
            p = dt.datetime.fromisoformat(x["snippet"]["publishedAt"].replace("Z", "+00:00"))
            dur = y.iso_seconds(x["contentDetails"]["duration"])
            if p >= cut and is_lesson(x["snippet"]["title"], x["snippet"]["description"], dur):
                out.append({"id": x["id"], "title": x["snippet"]["title"], "desc": x["snippet"]["description"],
                            "published": p, "duration": dur})
    out.sort(key=lambda r: r["published"], reverse=True)       # newest first, then work backwards
    return out


def stamps(desc: str) -> list[int]:
    out = []
    for line in desc.splitlines():
        m = STAMP_RE.match(line)
        if m:
            a, b, c = int(m.group(1)), int(m.group(2)), m.group(3)
            out.append(a * 3600 + b * 60 + int(c) if c else a * 60 + b)
    return out


def timestamps_ok(desc: str, duration: float) -> bool:
    ts = stamps(desc)
    if len(ts) < 3:
        return False
    return not (duration > 1800 and max(ts) < 120)             # all inside the first 2 min = minutes/seconds mix-up


def merge_description(existing: str, chapters: list[dict]) -> str:
    """Keep everything already in the description; put (or replace) the timestamp block under the n/total line."""
    lines = [l for l in existing.splitlines() if not STAMP_RE.match(l)]
    while lines and not lines[-1].strip() and False:
        lines.pop()
    block = "\n".join(f"{metadata._fmt_ts(c['t'])} {c['title']}" for c in chapters)
    head, rest = [], lines
    if lines and COUNT_RE.match(lines[0].strip()):
        head, rest = [lines[0]], lines[1:]
    while rest and not rest[0].strip():
        rest = rest[1:]
    parts = []
    if head:
        parts.append("\n".join(head))
    if block:
        parts.append(block)
    if rest:
        parts.append("\n".join(rest))
    return "\n\n".join(parts)


def send_summary(done_now: list[dict], skipped_unparsed: list[str], oldest: dict | None, stopped: str,
                 newbies: list[str]) -> None:
    try:
        import run
        lines = [f"Lesson titles/timestamps - {len(done_now)} done this session ({stopped})."]
        if oldest:
            lines.append(f"Oldest reached: {oldest['title']} ({oldest['published']:%m/%d/%Y})")
        if newbies:
            lines.append("Other students touched: " + ", ".join(n.title() for n in newbies))
        if skipped_unparsed:
            lines.append(f"Skipped (no lesson number): {', '.join(skipped_unparsed[:8])}"
                         + (f" +{len(skipped_unparsed) - 8} more" if len(skipped_unparsed) > 8 else ""))
        run.ping("\n".join(lines))
    except Exception as e:
        log(f"summary ping failed: {e!r}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1000)
    ap.add_argument("--until", default="", help="HH:MM local - don't start a new lesson after this")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    cutoff = None
    if args.until:
        h, m = (int(x) for x in args.until.split(":"))
        cutoff = dt.datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)
        if cutoff <= dt.datetime.now():
            cutoff += dt.timedelta(days=1)                    # e.g. 05:30 asked in the evening = tomorrow morning
    done = json.loads(DONE.read_text(encoding="utf-8")) if DONE.is_file() else {}
    yt = y.get_service()
    vids = listing(yt, args.days)
    log(f"backfill: {len(vids)} videos")
    TMP.mkdir(parents=True, exist_ok=True)
    did, unparsed, oldest, stopped = [], [], None, "finished the list"
    newbies: list[str] = []
    todo = 0
    for v in vids:
        m = TITLE_RE.match(v["title"].strip())
        dm = COUNT_RE.match((v["desc"].splitlines() or [""])[0].strip())
        if m:
            label, n, rest = m.group(1).strip(), int(m.group(2)), (m.group(3) or "").strip()
        elif dm and v["title"].strip():                      # e.g. "Kaether Jer" + description "103/106"
            label, n, rest = v["title"].strip(), int(dm.group(1)), ""
        else:
            unparsed.append(v["title"])
            continue
        if rest.startswith("-"):
            rest = rest.lstrip("- ").strip()
        has_topic = len(rest) >= 3                          # 'if' / 'a' are leftovers, not a topic
        for s in students.load()["students"]:
            if label.lower() == s["display"].lower():
                label = s["display"]                         # fixes 'Ben m' -> 'Ben M'
        if n == 0:
            continue
        if v["id"] in done and timestamps_ok(v["desc"], v["duration"]):
            continue
        if timestamps_ok(v["desc"], v["duration"]):
            continue                                        # already has good timestamps
        todo += 1
        if args.dry:
            log(f"would do: {v['title']!r} ({v['duration'] / 60:.0f} min, {v['published']:%Y-%m-%d})"
                f" - {'keep title, add timestamps' if has_topic else 'topic + timestamps'}")
            continue
        if cutoff and dt.datetime.now() >= cutoff:
            stopped = f"stopped at {args.until}"
            break
        vid = TMP / f"{v['id']}.m4a"
        if not (lt.work_dir(vid) / "transcript.json").is_file():
            log(f"backfill: downloading audio for {v['title']!r}")
            got = None
            for _ in range(3):                               # YouTube sometimes answers 403 once, then works
                r = subprocess.run([sys.executable, "-m", "yt_dlp", "-f", "bestaudio[ext=m4a]/bestaudio",
                                    "-o", str(TMP / f"{v['id']}.%(ext)s"),
                                    f"https://www.youtube.com/watch?v={v['id']}"],
                                   capture_output=True, text=True)
                got = next(iter(TMP.glob(f"{v['id']}.*")), None)
                if r.returncode == 0 and got:
                    break
                time.sleep(20)
            if not got:
                log(f"backfill: download failed for {v['title']!r}")
                continue
            vid = got
        data = lt.transcribe(vid)
        try:
            meta = metadata.ask(data, label)
        except Exception as e:
            log(f"backfill: topic failed for {v['title']!r}: {e}")
            continue
        if len(meta["chapters"]) < 3:
            log(f"backfill: too few timestamps for {v['title']!r}, skipping")
            continue
        title = v["title"] if has_topic else metadata.build_title(label, n, meta["topic"])
        desc = merge_description(v["desc"], meta["chapters"])
        y.update_video(yt, v["id"], title, desc)
        done[v["id"]] = title
        DONE.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
        did.append(v)
        base = label.split()[0].lower()
        if base not in KNOWN and base not in newbies:
            newbies.append(base)
            log(f"backfill: NEW STUDENT touched: {label}")
        oldest = {"title": title, "published": v["published"]}
        log(f"backfill: updated -> {title}  ({len(meta['chapters'])} timestamps)  [{v['published']:%Y-%m-%d}]")
        for f in TMP.glob(f"{v['id']}.*"):
            f.unlink(missing_ok=True)
    log(f"backfill: {stopped}. {len(did)} done, {todo - len(did)} left")
    if not args.dry:
        send_summary(did, unparsed, oldest, stopped, newbies)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
