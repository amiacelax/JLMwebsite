"""YT Plate Clipper — standalone weekday watcher.

Flow (Mon-Fri only):
  * Friday evening: WEEKLY CHECK — list what's waiting in F:\\OBS Recording New\\YT Plates
    and ping JD. Nothing is transcribed yet. (weekly.py; rules.json auto-skips slots JD
    never wants, e.g. Faye Mon 9pm+.)
  * JD approves lessons ("clip 1,3" -> `python weekly.py approve 1 3`).
  * For each APPROVED lesson: Whisper transcript -> regex shortlist -> Claude pick + copy
    -> review.md -> review ping.

Does NOT cut, composite, or post anything. Runs headless (Windows Scheduled Task).

Usage:
  python watch.py                    # loop forever (service mode)
  python watch.py --once             # one pass (weekly check if due + process approved), then exit
  python watch.py --ignore-weekday   # test on a weekend
"""
from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

import config
import store
from config import POLL_SECONDS, ensure_dirs, is_weekday, log


def process_video(video: Path, state: dict) -> None:
    import claude_pick
    import prefilter
    import review as review_mod
    import transcribe

    key = store.file_key(video)
    wd = store.work_dir_for(video)
    wd.mkdir(parents=True, exist_ok=True)
    log(f"=== processing {video.name} -> {wd}")
    rec = state.setdefault(key, {})
    rec.update({
        "name": video.name,
        "status": "processing",
        "work_dir": str(wd),
        "started": datetime.now().isoformat(timespec="seconds"),
    })
    store.save_processed(state)

    try:
        result = transcribe.transcribe(video, wd)
        pf = prefilter.find_candidates(result.get("segments", []))
        log(f"prefilter: {len(pf)} regex candidate windows")
        data = claude_pick.pick(result, pf, wd, video.name)
        review_path = review_mod.write_review_md(data, wd, video.name)
        provisional = bool(data.get("provisional"))

        ping_ok = False
        if provisional:
            # $0 path: Claude finishes the pick inside Cursor (finalize.py pings then).
            log("awaiting Claude pick in Cursor (no ping yet — finalize.py pings the real review)")
        else:
            try:
                import ping
                ping_ok = ping.send_review_ping(review_mod.ping_summary(data, video.name), review_path)
            except Exception as e:  # ping failure must not lose the work
                log(f"ping: error {e!r}")

        rec.update({
            "status": "awaiting-cursor-pick" if provisional else "reviewed",
            "candidates": len(data.get("clips", [])),
            "review": str(review_path),
            "pinged": ping_ok,
            "finished": datetime.now().isoformat(timespec="seconds"),
        })
        store.save_processed(state)
        log(f"=== done {video.name}: {rec['status']}, {rec['candidates']} candidates")
    except Exception as e:
        log(f"!!! ERROR on {video.name}: {e!r}")
        log(traceback.format_exc())
        rec.update({
            "status": "error",
            "error": str(e),
            "finished": datetime.now().isoformat(timespec="seconds"),
        })
        store.save_processed(state)


def find_approved(state: dict) -> list[Path]:
    out: list[Path] = []
    for rec_key, rec in state.items():
        if rec.get("status") != "approved":
            continue
        # key is the lowercase path; the real path lives in the latest queue entry.
        p = _path_for(rec_key, rec)
        if p and p.is_file():
            out.append(p)
        else:
            log(f"approved file not found, skipping: {rec.get('name')}")
    return out


def _path_for(key: str, rec: dict) -> Path | None:
    for it in store.load_queue().get("items", []):
        if it.get("key") == key:
            return Path(it["path"])
    cand = config.WATCH_DIR / rec.get("name", "")
    return cand if cand.is_file() else None


def run_once(state: dict, ignore_weekday: bool = False) -> int:
    if not ignore_weekday and not is_weekday():
        log("weekend — skipping (files wait until Monday)")
        return 0

    import weekly
    try:
        weekly.maybe_run_digest()
    except Exception as e:
        log(f"weekly check error: {e!r}")
        log(traceback.format_exc())

    state.clear()
    state.update(store.load_processed())  # pick up approvals made from the CLI
    count = 0
    for video in find_approved(state):
        process_video(video, state)
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="YT Plate Clipper watcher")
    parser.add_argument("--once", action="store_true", help="one pass then exit")
    parser.add_argument("--ignore-weekday", action="store_true", help="ignore the Mon-Fri gate")
    args = parser.parse_args()

    ensure_dirs()
    log(f"watcher start — dir={config.WATCH_DIR} backend={config.CLAUDE_BACKEND} "
        f"model={config.WHISPER_MODEL} ping={'on' if config.PING_ENABLED else 'off'} "
        f"background={config.current_background().name} mode={'once' if args.once else 'loop'}")

    state = store.load_processed()
    # Anything left mid-"processing" by a crash/reboot goes back to approved.
    for rec in state.values():
        if rec.get("status") == "processing":
            rec["status"] = "approved"
    store.save_processed(state)

    if args.once:
        n = run_once(state, ignore_weekday=args.ignore_weekday)
        log(f"once: processed {n} file(s)")
        return 0

    # Single-instance guard: the keep-alive task fires every 5 min; a second copy exits.
    import socket
    guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        guard.bind(("127.0.0.1", 47653))
    except OSError:
        log("another watcher is already running — exiting this copy")
        return 0

    while True:
        try:
            run_once(state, ignore_weekday=args.ignore_weekday)
        except Exception as e:
            log(f"loop error: {e!r}")
            log(traceback.format_exc())
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
