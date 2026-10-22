"""Who is a plate (greenscreen recording) a lesson with?

Plates are the SAME recordings as the lessons uploaded to YouTube (OBS records both), so the
length matches the YouTube video to within a few seconds. We match by length against:
  1. the uploader's own records  (yt-lesson-uploader/state/uploads.json) - new lessons
  2. the channel's videos on YouTube (cached in state/lesson_index.json) - older lessons
Fallback: the usual weekly slot (students.json schedule).

python identify.py            list every plate with who it is + how we know
python identify.py --refresh  re-read the YouTube channel first
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import config

UPLOADER = config.REPO / "yt-lesson-uploader"
INDEX = config.STATE / "lesson_index.json"
TOL = 3.5                      # seconds - plate vs YouTube length (real diffs are 0-2s)
LABEL = re.compile(r"^(.*?) (\d+)(?: - .*)?$")


def refresh_index() -> list[dict]:
    """All lesson videos on the channel: id, title label/number, length (sec)."""
    sys.path.insert(0, str(UPLOADER))
    try:
        import youtube_api as y
        yt = y.get_service()
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
            for v in yt.videos().list(part="snippet,contentDetails,status", id=",".join(ids[i:i + 50])).execute()["items"]:
                secs = y.iso_seconds(v["contentDetails"]["duration"])
                m = LABEL.match(v["snippet"]["title"])
                if secs < 15 * 60 or not m:
                    continue
                out.append({"id": v["id"], "title": v["snippet"]["title"], "label": m.group(1), "n": int(m.group(2)),
                            "secs": secs, "privacy": v["status"]["privacyStatus"],
                            "published": v["snippet"]["publishedAt"][:10]})
    finally:
        sys.path.remove(str(UPLOADER))
    INDEX.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def load_index(refresh: bool = False) -> list[dict]:
    if refresh or not INDEX.is_file():
        return refresh_index()
    return json.loads(INDEX.read_text(encoding="utf-8"))


def _uploader_records() -> list[dict]:
    p = UPLOADER / "state" / "uploads.json"
    if not p.is_file():
        return []
    out = []
    for name, rec in json.loads(p.read_text(encoding="utf-8")).items():
        if rec.get("duration") and rec.get("title"):
            m = LABEL.match(rec["title"])
            if m:
                out.append({"id": rec.get("video_id"), "title": rec["title"], "label": m.group(1), "n": int(m.group(2)),
                            "secs": rec["duration"]})
    return out


def identify(duration_s: float, start: datetime | None = None, sched_label: str | None = None) -> dict | None:
    """Best lesson match: same length (within TOL s) AND uploaded on/after the day it was recorded.
    If several fit, prefer the one matching the usual-slot student; otherwise the closest length.
    Still ambiguous -> {"ambiguous": [...]}."""
    day = start.strftime("%Y-%m-%d") if start else "0000"
    # Real plate-vs-YouTube pairs: the YouTube video is 0.7-2.7 s longer than the plate (never shorter, never equal).
    # A closer/farther length is a coincidence with some other lesson. Uploader records are the raw file length, so +-TOL.
    cands = [c for c in _uploader_records() if abs(c["secs"] - duration_s) <= TOL]
    cands += [c for c in load_index() if -2.7 <= duration_s - c["secs"] <= -0.7 and c.get("published", "9999") >= day]
    if not cands:
        return None
    if sched_label:
        pref = [c for c in cands if c["label"].lower().startswith(sched_label.lower().split()[0])]
        if pref:
            cands = pref
    cands.sort(key=lambda c: abs(c["secs"] - duration_s))
    labels = {c["label"].lower() for c in cands}
    if len(labels) > 1:
        return {"ambiguous": sorted(cands_title[:30] for cands_title in (c["title"] for c in cands)), "secs": cands[0]["secs"]}
    return cands[0]


def main() -> int:
    import subprocess
    refresh = "--refresh" in sys.argv
    load_index(refresh)
    sys.path.insert(0, str(UPLOADER))
    import students
    sdata = students.load()
    import weekly
    for p in sorted(config.WATCH_DIR.glob("*.mp4")):
        if p.stat().st_size < 200 * 1024 * 1024:
            continue
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                 capture_output=True, text=True).stdout.strip() or 0)
        start = weekly.lesson_start(p, d)
        sched = students.from_schedule(sdata, start)[0]
        hit = identify(d, start, sched["display"] if sched else None)
        if hit and "ambiguous" in hit:
            who = "AMBIGUOUS " + "/".join(hit["ambiguous"])
        elif hit:
            who = f"{hit['title'][:36]}  (YouTube, length diff {abs(hit['secs'] - d):.1f}s)"
        else:
            who = "no YouTube match"
        print(f"{start:%a %m/%d %H:%M} {d / 60:.0f}m  {who}   [schedule says: {sched['display'] if sched else '?'}]  {p.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

