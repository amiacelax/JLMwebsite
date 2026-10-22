"""Is tomorrow still the same? Nightly read of JLM Calendar.

python tomorrow_check.py            # 9 PM task: don't-forget + schedule diffs
python tomorrow_check.py --dry-run  # write the message, do not ping or save
python tomorrow_check.py --self-test

Reads languagementor.jp@gmail.com through gcal.py. Never creates, edits, or deletes events.
Pings JD in Discord Other Notifications. Never contacts students or clients.
Thursday notary appointments are ignored (same as the errand reminders).

Main job: the night before an errand, tell JD what he 100% cannot forget to bring.
Schedule moves / real conflicts are secondary.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import gcal
import settings

JST = dt.timezone(dt.timedelta(hours=9))
CALENDAR_ID = "languagementor.jp@gmail.com"
WINDOW_DAYS = 28
TRAVEL_MIN = 30
STATE_PATH = settings.STATE_DIR / "tomorrow-cal.json"
LOG_PATH = Path(__file__).parent / "tomorrow-check.log"
UA = "JLM-TomorrowCheck/1.0"

ERRAND_WORDS = (
    "歯医者", "dentist", "ナンバー", "plate", "マイナンバー", "mynumber", "my number",
    "市役所", "区役所", "役所", "銀行", "bank", "郵便", "post office", "dmv",
    "パスポート", "passport", "meetup", "meetup",
)
NOTARY_PRICE = re.compile(r"\d[\d,]{3,}")

# What JD cannot forget, from past chats. First matching rule wins.
BRING_RULES: list[tuple[tuple[str, ...], str]] = (
    (("ナンバー", "plate", "dmv"), "old plates"),
    (("マイナンバー", "mynumber", "my number"), "the 通知書, the person, and 2 photo IDs"),
    (("歯医者", "dentist"), "their My Number card (in your backpack)"),
    (("市役所", "区役所", "役所"), "ID + any letters/forms for that visit"),
    (("銀行", "bank"), "bank card/book, ID, and cash if you need it"),
    (("郵便", "post office"), "the package/letter and ID"),
    (("パスポート", "passport"), "the passport + whatever the renewal letter asks for"),
)


def _log(msg: str) -> None:
    line = f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    try:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    try:
        print(line, flush=True)
    except UnicodeError:
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)


def _hm(iso: str) -> str:
    return f"{dt.datetime.fromisoformat(iso).astimezone(JST):%H:%M}"


def _is_thursday_notary(ev: dict) -> bool:
    start = dt.datetime.fromisoformat(ev["start"]).astimezone(JST)
    if start.weekday() != 3:
        return False
    title = (ev.get("title") or "").strip()
    low = title.casefold()
    if low == "placeholder" or "notary" in low:
        return True
    return bool(NOTARY_PRICE.search(title))


def _is_errand(ev: dict) -> bool:
    title = (ev.get("title") or "").casefold()
    return any(w.casefold() in title for w in ERRAND_WORDS)


def _load() -> dict:
    if not STATE_PATH.is_file():
        return {"days": {}, "conflicts": {}, "forgot_sent": {}}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"days": {}, "conflicts": {}, "forgot_sent": {}}
    data.setdefault("days", {})
    data.setdefault("conflicts", {})
    data.setdefault("forgot_sent", {})
    return data


def _save(data: dict) -> None:
    settings.STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(STATE_PATH)


def fetch_timed(start: dt.datetime, end: dt.datetime) -> list[dict]:
    """Timed events only. All-day reminders are skipped. Read-only."""
    cal = gcal.service()
    items: list[dict] = []
    page = None
    while True:
        req = cal.events().list(
            calendarId=CALENDAR_ID,
            timeMin=start.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
            pageToken=page,
            fields="items(status,summary,start,end),nextPageToken",
        )
        res = req.execute()
        items.extend(res.get("items", []))
        page = res.get("nextPageToken")
        if not page:
            break
    out = []
    for e in items:
        if e.get("status") == "cancelled":
            continue
        s, en = (e.get("start") or {}).get("dateTime"), (e.get("end") or {}).get("dateTime")
        if not s or not en:
            continue
        out.append({"title": (e.get("summary") or "(no title)").strip(), "start": s, "end": en})
    return [e for e in out if not _is_thursday_notary(e)]


def _by_day(events: list[dict]) -> dict[str, list[dict]]:
    days: dict[str, list[dict]] = {}
    for e in events:
        key = dt.datetime.fromisoformat(e["start"]).astimezone(JST).date().isoformat()
        days.setdefault(key, []).append({"title": e["title"], "start": e["start"], "end": e["end"]})
    for key in days:
        days[key].sort(key=lambda ev: (ev["start"], ev["end"], ev["title"]))
    return days


def _who_from_title(title: str, words: tuple[str, ...]) -> str:
    who = title
    for w in words:
        who = re.sub(re.escape(w), " ", who, flags=re.IGNORECASE)
    who = re.sub(r"(?i)\b(card|カード)\b", " ", who)
    return re.sub(r"\s+", " ", who).strip(" -–—\t")


def bring_for(ev: dict) -> str | None:
    """What JD 100% cannot forget for this event. None = lesson / nothing to pack."""
    title = (ev.get("title") or "").strip()
    low = title.casefold()
    for words, tip in BRING_RULES:
        if any(w.casefold() in low for w in words):
            who = _who_from_title(title, words)
            if "マイナンバー" in words or "mynumber" in words or "my number" in words:
                if who:
                    return f"{who}: 通知書, {who}, and 2 photo IDs"
                return tip
            if "歯医者" in words or "dentist" in words:
                if who:
                    return f"{who}'s dentist — put their My Number card in your backpack"
                return tip
            if "ナンバー" in words or "plate" in words or "dmv" in words:
                return f"{title} — bring the old plates"
            return f"{title} — {tip}"
    return None


def forget_lines(events: list[dict]) -> list[str]:
    lines = []
    seen: set[str] = set()
    for e in sorted(events, key=lambda x: x["start"]):
        tip = bring_for(e)
        if not tip or tip in seen:
            continue
        seen.add(tip)
        lines.append(f"{_hm(e['start'])} {tip}")
    return lines


def changes_for(old: list[dict] | None, new: list[dict]) -> list[str]:
    """What moved, got added, got canceled, or changed length. First look is not a change."""
    if old is None:
        return []
    old_by: dict[str, list[dict]] = {}
    new_by: dict[str, list[dict]] = {}
    for e in old:
        old_by.setdefault(e["title"], []).append(e)
    for e in new:
        new_by.setdefault(e["title"], []).append(e)
    lines = []
    for title in sorted(set(old_by) | set(new_by)):
        o = sorted(old_by.get(title, []), key=lambda e: e["start"])
        n = sorted(new_by.get(title, []), key=lambda e: e["start"])
        used: set[int] = set()
        unmatched_old = []
        for a in o:
            hit = next((i for i, b in enumerate(n) if i not in used and b["start"] == a["start"]), None)
            if hit is None:
                unmatched_old.append(a)
                continue
            used.add(hit)
            b = n[hit]
            if a["end"] != b["end"]:
                word = "longer" if b["end"] > a["end"] else "shorter"
                lines.append(f"{title} {_hm(b['start'])} got {word} (now until {_hm(b['end'])}, was until {_hm(a['end'])})")
        unmatched_new = [b for i, b in enumerate(n) if i not in used]
        pairs = min(len(unmatched_old), len(unmatched_new))
        for a, b in zip(unmatched_old[:pairs], unmatched_new[:pairs]):
            extra = f" (now until {_hm(b['end'])})" if a["end"] != b["end"] else ""
            lines.append(f"{title} moved from {_hm(a['start'])} to {_hm(b['start'])}{extra}")
        for a in unmatched_old[pairs:]:
            lines.append(f"{title} canceled (was {_hm(a['start'])}–{_hm(a['end'])})")
        for b in unmatched_new[pairs:]:
            lines.append(f"{title} added {_hm(b['start'])}–{_hm(b['end'])}")
    return lines


def _nested(a: dict, b: dict) -> bool:
    """Same-trip nesting (plates 11:30–17:00 covering My Number 14:00–15:00) is fine."""
    a0, a1 = dt.datetime.fromisoformat(a["start"]), dt.datetime.fromisoformat(a["end"])
    b0, b1 = dt.datetime.fromisoformat(b["start"]), dt.datetime.fromisoformat(b["end"])
    return (a0 <= b0 and b1 <= a1) or (b0 <= a0 and a1 <= b1)


def conflict_lines(events: list[dict]) -> list[str]:
    evs = sorted(events, key=lambda e: (e["start"], e["end"]))
    lines = []
    for i, a in enumerate(evs):
        a0, a1 = dt.datetime.fromisoformat(a["start"]), dt.datetime.fromisoformat(a["end"])
        for b in evs[i + 1:]:
            b0, b1 = dt.datetime.fromisoformat(b["start"]), dt.datetime.fromisoformat(b["end"])
            if b0 >= a1:
                break
            if a0 < b1 and b0 < a1 and not _nested(a, b):
                lines.append(
                    f"{a['title']} {_hm(a['start'])}–{_hm(a['end'])} overlaps "
                    f"{b['title']} {_hm(b['start'])}–{_hm(b['end'])}"
                )
    for a, b in zip(evs, evs[1:]):
        if not (_is_errand(a) or _is_errand(b)):
            continue
        if _nested(a, b):
            continue
        gap = dt.datetime.fromisoformat(b["start"]) - dt.datetime.fromisoformat(a["end"])
        if dt.timedelta(0) <= gap < dt.timedelta(minutes=TRAVEL_MIN):
            lines.append(
                f"No time between {a['title']} (ends {_hm(a['end'])}) and {b['title']} ({_hm(b['start'])})"
            )
    return lines


def post_other(text: str) -> bool:
    hook = os.environ.get("DISCORD_OTHER_WEBHOOK_URL", "").strip()
    if not hook:
        _log("tomorrow: DISCORD_OTHER_WEBHOOK_URL missing — not pinged")
        return False
    req = urllib.request.Request(
        hook, method="POST",
        data=json.dumps({"content": text[:1900], "flags": 4}).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return 200 <= r.status < 300
    except Exception as e:
        _log(f"tomorrow: Discord post failed: {e!r}")
        return False


def build_message(
    forgot: list[str],
    changes: list[str],
    new_conflicts: list[str],
    *,
    send_forgot: bool,
) -> str:
    parts = []
    if send_forgot and forgot:
        parts.append("Don't forget tomorrow:\n" + "\n".join(f"- {c}" for c in forgot))
    if changes:
        parts.append("Tomorrow changed:\n" + "\n".join(f"- {c}" for c in changes))
    if new_conflicts:
        parts.append("Watch out:\n" + "\n".join(f"- {c}" for c in new_conflicts))
    return "\n".join(parts)


def run(dry: bool = False, now: dt.datetime | None = None) -> str:
    now = (now or dt.datetime.now(JST)).astimezone(JST)
    tomorrow = (now + dt.timedelta(days=1)).date()
    window_start = dt.datetime.combine(tomorrow, dt.time(0, 0), JST)
    window_end = window_start + dt.timedelta(days=WINDOW_DAYS)
    fresh = _by_day(fetch_timed(window_start, window_end))
    state = _load()
    key = tomorrow.isoformat()
    todays = fresh.get(key, [])
    old_raw = state["days"].get(key)
    old = None if old_raw is None else [e for e in old_raw if not _is_thursday_notary(e)]
    forgot = forget_lines(todays)
    changes = changes_for(old, todays)
    conflicts = conflict_lines(todays)
    seen = set(state["conflicts"].get(key, []))
    new_conflicts = [c for c in conflicts if c not in seen]
    send_forgot = bool(forgot) and key not in state["forgot_sent"]
    message = build_message(forgot, changes, new_conflicts, send_forgot=send_forgot)
    if dry:
        return message
    if message:
        if not post_other(message):
            _log("tomorrow: not saved, so the next run can retry the ping")
            return message
        _log(
            f"tomorrow: pinged (forgot={len(forgot) if send_forgot else 0}, "
            f"changes={len(changes)}, conflicts={len(new_conflicts)})"
        )
        if send_forgot:
            state["forgot_sent"][key] = True
    else:
        _log("tomorrow: no change")
    state["days"] = {
        (tomorrow + dt.timedelta(days=i)).isoformat(): fresh.get(
            (tomorrow + dt.timedelta(days=i)).isoformat(), []
        )
        for i in range(WINDOW_DAYS)
    }
    state["conflicts"][key] = conflicts
    state["conflicts"] = {k: v for k, v in state["conflicts"].items() if k >= key}
    state["forgot_sent"] = {k: v for k, v in state["forgot_sent"].items() if k >= key}
    _save(state)
    return message


def _self_test() -> None:
    base = "2026-10-20T{t}:00+09:00"

    def ev(title, sh, sm, eh, em):
        return {
            "title": title,
            "start": base.format(t=f"{sh:02d}:{sm:02d}"),
            "end": base.format(t=f"{eh:02d}:{em:02d}"),
        }

    matt = ev("マット", 11, 30, 12, 30)
    moved = ev("マット", 12, 0, 13, 0)
    assert changes_for(None, [matt]) == []
    assert changes_for([matt], [matt]) == []
    assert "moved from 11:30 to 12:00" in changes_for([matt], [moved])[0]
    assert "canceled" in changes_for([matt], [])[0]
    assert "added" in changes_for([], [matt])[0]
    longer = ev("マット", 11, 30, 13, 0)
    assert "got longer" in changes_for([matt], [longer])[0]
    shorter = ev("マット", 11, 30, 12, 0)
    assert "got shorter" in changes_for([matt], [shorter])[0]
    # back-to-back lessons are fine
    lesson2 = ev("ジョッシュ", 12, 30, 13, 30)
    assert conflict_lines([matt, lesson2]) == []
    # real overlap (not nested)
    assert "overlaps" in conflict_lines([matt, ev("ジョッシュ", 12, 0, 13, 0)])[0]
    # nested same-trip is fine
    plates = ev("ナンバープレート", 11, 30, 17, 0)
    inoru = ev("Inoru My number Card", 14, 0, 15, 0)
    assert conflict_lines([plates, inoru]) == []
    # errand with no gap
    short_plates = ev("ナンバープレート", 11, 30, 12, 30)
    assert "No time" in conflict_lines([short_plates, lesson2])[0]
    later = ev("ジョッシュ", 13, 0, 14, 0)
    assert conflict_lines([short_plates, later]) == []
    # don't-forget tips
    tips = forget_lines([plates, inoru, ev("讃　歯医者", 9, 45, 10, 45), matt])
    assert any("old plates" in t for t in tips)
    assert any(t.startswith("14:00 Inoru:") and "通知書" in t for t in tips)
    assert any("讃" in t and "My Number" in t for t in tips)
    assert not any("マット" in t for t in tips)
    msg = build_message(tips, [], [], send_forgot=True)
    assert msg.startswith("Don't forget tomorrow:")
    assert "Watch out" not in msg
    # Thursday notary cluster is ignored
    ph = [
        {"title": "PLACEHOLDER", "start": "2026-10-15T12:00:00+09:00", "end": "2026-10-15T12:30:00+09:00"},
        {"title": "Kohei Okimuro 30000", "start": "2026-10-15T12:45:00+09:00", "end": "2026-10-15T13:15:00+09:00"},
    ]
    assert all(_is_thursday_notary(e) for e in ph)
    print("self-test ok")


def main() -> int:
    if "--self-test" in sys.argv:
        _self_test()
        return 0
    dry = "--dry-run" in sys.argv
    try:
        message = run(dry=dry)
    except Exception as e:
        _log(f"tomorrow: failed ({e!r})")
        return 1
    if dry:
        out = Path(__file__).parent / "tomorrow-dry.txt"
        out.write_text(message or "(empty — nothing to forget / no changes)\n", encoding="utf-8")
        _log("tomorrow: dry-run " + ("empty" if not message else "has a message"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
