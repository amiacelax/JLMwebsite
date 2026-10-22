"""Weekly check — JD decides which lessons get clipped.

Friday evening (DIGEST_HOUR, JST) the watcher lists everything waiting in
F:\\OBS Recording New\\YT Plates and pings JD. NOTHING is transcribed until JD
approves. Time-of-day rules (rules.json) auto-skip lessons JD never wants clipped
(e.g. Faye, Mon 9pm+) — they're still listed, marked auto-skipped, and can be overridden.

CLI:
  python weekly.py digest [--force] [--no-ping]   run the weekly check now
  python weekly.py list                           show the latest numbered list
  python weekly.py approve 1 3 | all              clip these (all = every non-auto-skipped)
  python weekly.py skip 2 | all                   don't clip these
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import config
import store
from config import DIGEST_HOUR, DIGEST_MINUTE, DIGEST_WEEKDAY, RULES_JSON, VIDEO_EXTS, log

NAME_TIME = re.compile(r"(\d{4})-(\d{2})-(\d{2})[ _T](\d{2})-(\d{2})-(\d{2})")
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
ELIGIBLE = {None, "queued", "rule-skipped"}


# --- file facts --------------------------------------------------------------
def probe_duration(path: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, timeout=60,
        ).stdout.strip()
        return float(out)
    except Exception:
        return 0.0


def lesson_start(path: Path, duration: float) -> datetime:
    """Start time: from OBS filename (YYYY-MM-DD HH-MM-SS) else modified-time minus length."""
    m = NAME_TIME.search(path.name)
    if m:
        y, mo, d, h, mi, s = (int(x) for x in m.groups())
        return datetime(y, mo, d, h, mi, s)
    return datetime.fromtimestamp(path.stat().st_mtime) - timedelta(seconds=duration)


def tag_from_name(path: Path) -> str:
    """Anything after the timestamp, e.g. '2026-10-05 12-37-14 CJ 4' -> 'CJ 4'."""
    rest = NAME_TIME.sub("", path.stem)
    rest = re.sub(r"(?i)yt[- ]plates?", "", rest)  # OBS plate prefix isn't a student name
    return rest.strip(" -_")


# --- rules -------------------------------------------------------------------
def load_rules() -> list[dict]:
    if not RULES_JSON.is_file():
        return []
    try:
        return json.loads(RULES_JSON.read_text(encoding="utf-8")).get("rules", [])
    except Exception as e:
        log(f"rules.json unreadable ({e!r}) — ignoring rules")
        return []


def who_is_it(path: Path, duration: float, start: datetime) -> str | None:
    """Student label for a plate: matched to its YouTube lesson by length (identify.py), else the usual weekly slot."""
    try:
        import identify
        sys.path.insert(0, str(identify.UPLOADER))
        import students
        sched = students.from_schedule(students.load(), start)[0]
        hit = identify.identify(duration, start, sched["display"] if sched else None)
        if hit and "ambiguous" not in hit:
            return hit["title"].split(" - ")[0].strip()
        return sched["display"] if sched else None
    except Exception as e:
        log(f"weekly: couldn't identify {path.name}: {e!r}")
        return None


def student_skip(who: str | None) -> str | None:
    """rules.json -> skip_students: ["Mo", "CJ", "Christian", "Faye"] = never clip these students."""
    if not who:
        return None
    for s in json.loads(RULES_JSON.read_text(encoding="utf-8")).get("skip_students", []) if RULES_JSON.is_file() else []:
        if who.lower().split()[0] == s.lower():
            return f"never clip {s}"
    return None


def matching_rule(rules: list[dict], start: datetime, filename: str) -> str | None:
    wd = WEEKDAYS[start.weekday()]
    for r in rules:
        days = r.get("weekdays")
        if days and wd not in days:
            continue
        if "from_hour" in r and start.hour < int(r["from_hour"]):
            continue
        if "to_hour" in r and start.hour >= int(r["to_hour"]):
            continue
        needle = r.get("match")
        if needle and needle.lower() not in filename.lower():
            continue
        return r.get("name", "rule")
    return None


# --- the weekly check --------------------------------------------------------
def digest_due(now: datetime, meta: dict) -> bool:
    """True once per week: the most recent Friday-evening mark has passed and no check was sent since."""
    days_back = (now.weekday() - DIGEST_WEEKDAY) % 7
    due = datetime.combine(now.date() - timedelta(days=days_back), datetime.min.time()).replace(hour=DIGEST_HOUR, minute=DIGEST_MINUTE)
    if due > now:
        due -= timedelta(days=7)
    last = meta.get("last_digest")
    if not last:
        return False  # first run: initialized in maybe_run_digest, no surprise ping
    return now >= due and datetime.fromisoformat(last) < due


def get_baseline() -> datetime:
    """Plates recorded before this moment are the old library and never listed.
    Set once = midnight of the day the clipper was first used (2026-10-07)."""
    meta = store.load_meta()
    if not meta.get("baseline"):
        meta["baseline"] = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
        store.save_meta(meta)
    return datetime.fromisoformat(meta["baseline"])


def collect_items(state: dict) -> list[dict]:
    rules = load_rules()
    items: list[dict] = []
    if not config.WATCH_DIR.is_dir():
        log(f"watch dir missing: {config.WATCH_DIR}")
        return items
    now = time.time()
    baseline = get_baseline()
    for p in sorted(config.WATCH_DIR.iterdir()):
        if not p.is_file() or p.suffix.lower() not in VIDEO_EXTS:
            continue
        if p.stat().st_size == 0 or now - p.stat().st_mtime < 60:
            continue  # empty stub, or OBS is still writing it — next check
        rec = state.get(store.file_key(p), {})
        if rec.get("status") not in ELIGIBLE:
            continue
        dur = probe_duration(p)
        if dur < config.MIN_PLATE_SECONDS:
            continue  # OBS test blip, not a lesson
        start = lesson_start(p, dur)
        if start < baseline:
            continue  # recorded before the clipper existed — old library, not listed
        who = who_is_it(p, dur, start)
        rule = matching_rule(rules, start, p.name) or student_skip(who)
        green = None
        if not rule:
            try:
                import keyer
                green = bool(keyer.analyze(p).get("has_green"))
            except Exception as e:
                log(f"weekly: green check failed for {p.name}: {e!r}")
        items.append({
            "key": store.file_key(p),
            "path": str(p),
            "name": p.name,
            "start": start.isoformat(timespec="minutes"),
            "label": f"{WEEKDAYS[start.weekday()]} {start:%m/%d %H:%M}",
            "minutes": round(dur / 60),
            "tag": who or tag_from_name(p),
            "rule": rule,
            "green": green,
        })
    items.sort(key=lambda i: i["start"])
    for n, it in enumerate(items, start=1):
        it["n"] = n
    return items


def _line(it: dict) -> str:
    bits = [f"{it['n']}) {it['label']} · {it['minutes']}m"]
    if it["tag"]:
        bits.append(it["tag"])
    if it["rule"]:
        bits.append(f"[auto-skip: {it['rule']}]")
    if it.get("green") is False:
        bits.append("[no greenscreen]")
    return " · ".join(bits)


def run_digest(ping: bool = True) -> int:
    state = store.load_processed()
    items = collect_items(state)
    meta = store.load_meta()
    meta["last_digest"] = datetime.now().isoformat(timespec="seconds")
    store.save_meta(meta)

    if not items:
        log("weekly: nothing waiting in the folder — no ping")
        store.save_queue({"created": meta["last_digest"], "items": []})
        return 0

    for it in items:
        rec = state.setdefault(it["key"], {"name": it["name"]})
        # JD: clip everything automatically; his approval is only for posting/uploading the drafts.
        rec["status"] = "rule-skipped" if it["rule"] else "approved"
        rec["rule"] = it["rule"]
    store.save_processed(state)
    store.save_queue({"created": meta["last_digest"], "items": items})

    live = [i for i in items if not i["rule"]]
    auto = [i for i in items if i["rule"]]
    lines = [_line(i) for i in items]
    pin, used = "", 0
    for ln in lines:
        if len(pin) + len(ln) + 1 > 940:
            pin += f"\n…+{len(lines) - used} more (see queue)"
            break
        pin += ("\n" if pin else "") + ln
        used += 1

    title = f"YT Plate Clipper: clipping {len(live)} lesson(s) now (drafts coming for your review)"
    if auto:
        title += f" (+{len(auto)} auto-skipped)"
    story = "Clips start automatically. Nothing posts until you approve the drafts."

    log(f"weekly: {len(items)} item(s) listed ({len(auto)} auto-skipped)")
    for ln in lines:
        log(f"weekly:   {ln}")
    if ping:
        import ping as ping_mod
        ping_mod.send_ping(title, pin, story)
    return len(items)


def maybe_run_digest(now: datetime | None = None) -> None:
    now = now or datetime.now()
    meta = store.load_meta()
    if not meta.get("last_digest"):
        meta["last_digest"] = now.isoformat(timespec="seconds")
        store.save_meta(meta)
        log("weekly: first run — next weekly check is the coming "
            f"{WEEKDAYS[DIGEST_WEEKDAY]} {DIGEST_HOUR:02d}:{DIGEST_MINUTE:02d} (use `python weekly.py digest --force` to run one now)")
        return
    if digest_due(now, meta):
        run_digest()


# --- approve / skip ----------------------------------------------------------
def _pick(numbers: list[str], q: dict) -> list[dict]:
    items = q.get("items", [])
    if numbers == ["all"]:
        return [i for i in items if not i["rule"]]
    chosen = []
    for n in numbers:
        try:
            chosen.append(next(i for i in items if i["n"] == int(n)))
        except (StopIteration, ValueError):
            print(f"no item #{n} in the latest list")
    return chosen


def set_status(numbers: list[str], status: str) -> int:
    q = store.load_queue()
    state = store.load_processed()
    chosen = _pick(numbers, q)
    for it in chosen:
        rec = state.setdefault(it["key"], {"name": it["name"]})
        rec["status"] = status
        print(f"#{it['n']} {it['label']} {it['tag']} -> {status}")
    store.save_processed(state)
    return len(chosen)


def show_list() -> None:
    q = store.load_queue()
    items = q.get("items", [])
    if not items:
        print("(nothing queued — run `python weekly.py digest --force`)")
        return
    state = store.load_processed()
    print(f"latest weekly check: {q.get('created')}")
    for it in items:
        st = state.get(it["key"], {}).get("status", "?")
        print(f"  {_line(it)}   -> {st}")


def main() -> int:
    ap = argparse.ArgumentParser(description="YT Plate Clipper weekly check")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("digest")
    d.add_argument("--force", action="store_true")
    d.add_argument("--no-ping", action="store_true")
    sub.add_parser("list")
    a = sub.add_parser("approve"); a.add_argument("numbers", nargs="+")
    s = sub.add_parser("skip"); s.add_argument("numbers", nargs="+")
    args = ap.parse_args()

    config.ensure_dirs()
    if args.cmd == "digest":
        run_digest(ping=not args.no_ping)
    elif args.cmd == "list":
        show_list()
    elif args.cmd == "approve":
        set_status(args.numbers, "approved")
    elif args.cmd == "skip":
        set_status(args.numbers, "skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
