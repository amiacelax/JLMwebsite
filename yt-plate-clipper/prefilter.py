"""Regex pre-pass over a transcript — free narrowing before Claude.

Mirrors .tmp-clip-hunt/hunt.py: tag windows as warning / analogy / wrong-then-right,
with a little context on each side. This is NOT the final pick — it just hands
Claude a shortlist so the model (and token spend) stays focused. Warnings first.
"""
from __future__ import annotations

import re

WARN = re.compile(
    r"\b(don'?t|do not|can'?t|cannot|doesn'?t mean|does not mean|be careful|watch out|"
    r"mess(?:ed)? up|never say|you can'?t say|that'?s not|isn'?t |careful|"
    r"not the same as|avoid|trap|mistake people make)\b",
    re.I,
)
ANALOGY = re.compile(
    r"(it'?s like|its like|think of it|same as|kind of like|sort of like|imagine |"
    r"picture |as if|the way you|almost like|i always thought|like when you|"
    r"like a |it'?s basically|you can think of)",
    re.I,
)
WRONGRIGHT = re.compile(
    r"\b(instead|rather than|the mistake|should be|correct|right way|wrong way|"
    r"say it like|not .+ but |you said|the fix|better to say|the right one)\b",
    re.I,
)

# warning first, then wrong-then-right (YT loves it), then analogy.
TAG_ORDER = ["warning", "wrong-then-right", "analogy"]
_PATTERNS = {
    "warning": WARN,
    "wrong-then-right": WRONGRIGHT,
    "analogy": ANALOGY,
}


def find_candidates(segments: list[dict], per_tag: int = 12) -> list[dict]:
    """Return candidate windows tagged + ordered (warnings first).

    Each candidate: {tag, start, end, hint_segment, context}.
    start/end are padded by one segment on each side for cut headroom.
    """
    out: list[dict] = []
    n = len(segments)
    for tag in TAG_ORDER:
        pat = _PATTERNS[tag]
        hits = 0
        for i, seg in enumerate(segments):
            text = seg.get("text", "")
            if not pat.search(text):
                continue
            lo = max(0, i - 1)
            hi = min(n - 1, i + 2)
            start = float(segments[lo]["start"])
            end = float(segments[hi]["end"])
            context = " | ".join(
                segments[j]["text"] for j in range(max(0, i - 1), min(n, i + 3))
            )
            out.append({
                "tag": tag,
                "start": round(start, 2),
                "end": round(end, 2),
                "hint_segment": text,
                "context": context,
            })
            hits += 1
            if hits >= per_tag:
                break
    return out
