"""Student list: who a recording belongs to (schedule / filename / transcript names) + numbering."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

import settings

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
NAME_TIME = re.compile(r"(\d{4})-(\d{2})-(\d{2})[ _](\d{2})-(\d{2})-(\d{2})")

# extra spellings Whisper tends to produce (Latin matched on word boundaries, katakana as-is)
WHO_VARIANTS = {
    "Emily": ["emily", "emilie", "エミリー", "エミリ"],
    "Jer": ["jer", "jeremiah", "ジェレマイア", "ジェレミア"],
    "Regina": ["regina", "reggina", "レジーナ", "レジーナさん"],
    "Michael": ["michael", "マイケル"],
}


def load() -> dict:
    return json.loads(settings.STUDENTS_JSON.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    tmp = settings.STUDENTS_JSON.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(settings.STUDENTS_JSON)


def by_key(data: dict, key: str) -> dict | None:
    key = key.strip().lower().replace(" ", "")
    for s in data["students"]:
        if key in (s["key"], s["display"].lower().replace(" ", "")):
            return s
    return None


def start_time(path: Path) -> datetime | None:
    m = NAME_TIME.search(path.name)
    if not m:
        return None
    return datetime(*(int(x) for x in m.groups()))


def from_filename(data: dict, path: Path):
    """JD sometimes types the name into the file ('... Faye 112.mp4'). Returns (student, number|None)."""
    rest = NAME_TIME.sub("", path.stem).strip(" -_")
    if not rest:
        return None, None
    low = rest.lower()
    best = None
    for s in data["students"]:
        for token in {s["display"].lower(), s["key"]}:
            m = re.search(rf"(?<![a-z]){re.escape(token)}(?![a-z])\s*(\d+)?", low)
            if m and (best is None or len(token) > best[2]):
                best = (s, int(m.group(1)) if m.group(1) else None, len(token))
    return (best[0], best[1]) if best else (None, None)


def from_schedule(data: dict, when: datetime):
    """-> (student|None, note). Conservative: ambiguous or no slot nearby -> None (ask JD)."""
    day = DAYS[when.weekday()]
    mins = when.hour * 60 + when.minute
    hits = []
    for s in data["students"]:
        for d, hhmm in s.get("schedule", []):
            if d != day:
                continue
            h, m = (int(x) for x in hhmm.split(":"))
            diff = abs(mins - (h * 60 + m))
            if diff <= settings.SLOT_WINDOW_MIN:
                hits.append((diff, s))
    hits.sort(key=lambda x: x[0])
    if not hits:
        return None, f"no usual slot within {settings.SLOT_WINDOW_MIN} min of {day} {when:%H:%M}"
    if len(hits) > 1 and hits[1][0] - hits[0][0] < 15:
        return None, f"{day} {when:%H:%M} fits {hits[0][1]['display']} and {hits[1][1]['display']}"
    return hits[0][1], f"{day} {when:%H:%M} = {hits[0][1]['display']}'s slot"


def pick_who(student: dict, transcript_text: str):
    """For students sharing a slot (Emily/Jer, Regina/Michael): count name mentions. -> (name|None, counts)"""
    counts = {}
    low = transcript_text.lower()
    for w in student.get("who", []):
        n = 0
        for v in WHO_VARIANTS.get(w["name"], [w["name"].lower()]) + [x.lower() for x in w.get("jp", [])]:
            if re.search(r"[a-z]", v):
                n += len(re.findall(rf"(?<![a-z]){re.escape(v)}(?![a-z])", low))
            else:
                n += low.count(v)
        counts[w["name"]] = n
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    if not ranked or ranked[0][1] < 2:
        return None, counts
    if len(ranked) > 1 and ranked[1][1] * 2 > ranked[0][1]:
        return None, counts          # not clearly one of them
    return ranked[0][0], counts


def label(student: dict, who: str | None) -> str:
    return f"{student['display']} {who}" if who else student["display"]


def next_numbers(student: dict, explicit: int | None = None):
    """-> (n, total). 'same_as_number' students (Noah) always have total == n."""
    n = explicit if explicit is not None else student["last"] + 1
    total = n if student.get("same_as_number") else student["total"]
    return n, total


def commit(data: dict, key: str, n: int, total: int) -> None:
    for s in data["students"]:
        if s["key"] == key:
            s["last"] = n
            s["total"] = total
