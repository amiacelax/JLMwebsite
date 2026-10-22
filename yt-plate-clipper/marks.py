"""Auto wrong/right marks: which spoken Japanese gets colored red (wrong) or green (right),
and where the buzzer / ding sound effects fire.

Order of preference per clip:
  1. clip["marks"] written by Claude in the pick (absolute lesson seconds), if present
  2. cue-phrase detection from the transcript (this file): "can't say X" -> X red,
     "do say / instead / correct Y" -> Y green, "X is wrong" -> X red
JD fixes anything by editing the clip's captions .txt (colors + @sfx lines) and re-running.
"""
from __future__ import annotations

import re

import captions

WRONG_CUES = [
    ("can't", "say"), ("cannot", "say"), ("cant", "say"), ("don't", "say"), ("dont", "say"),
    ("do", "not", "say"), ("never", "say"), ("don't", "do"), ("dont", "do"), ("can't", "use"), ("don't", "use"), ("not", "natural"),
    ("wrong",), ("incorrect",), ("mistake",), ("unnatural",), ("weird",), ("awkward",),
]
RIGHT_CUES = [
    ("do", "say"), ("should", "say"), ("you", "say"), ("instead",), ("correct",),
    ("right", "way"), ("the", "right"), ("natural",), ("which", "is"), ("better",),
]
BACKWARD_OK = {("wrong",), ("incorrect",), ("mistake",), ("unnatural",), ("weird",), ("awkward",),
               ("correct",), ("natural",), ("not", "natural")}

LOOKAHEAD = 3.5      # seconds after a cue to find the Japanese it refers to
LOOKBACK = 2.5
RUN_GAP = 1.0        # max silence inside one Japanese phrase
MAX_RUN_SEC = 9.0


def _norm(w: str) -> str:
    return re.sub(r"[^\w']", "", (w or "").lower().replace("’", "'"))


def _is_jp(w: dict) -> bool:
    return bool(captions.JP_RE.search(w.get("word") or ""))


def _run_after(words: list[dict], t: float):
    """First Japanese phrase starting within LOOKAHEAD of t."""
    for i, w in enumerate(words):
        if w["start"] >= t - 0.15 and w["start"] <= t + LOOKAHEAD and _is_jp(w):
            end = i
            while (end + 1 < len(words) and _is_jp(words[end + 1])
                   and words[end + 1]["start"] - words[end]["end"] < RUN_GAP
                   and words[end + 1]["end"] - w["start"] < MAX_RUN_SEC):
                end += 1
            return w["start"], words[end]["end"]
    return None


def _run_before(words: list[dict], t: float):
    """Japanese phrase that ends just before t."""
    idx = [i for i, w in enumerate(words) if w["end"] <= t + 0.1 and w["end"] >= t - LOOKBACK and _is_jp(w)]
    if not idx:
        return None
    last = idx[-1]
    first = last
    while (first - 1 >= 0 and _is_jp(words[first - 1])
           and words[first]["start"] - words[first - 1]["end"] < RUN_GAP
           and words[last]["end"] - words[first - 1]["start"] < MAX_RUN_SEC):
        first -= 1
    return words[first]["start"], words[last]["end"]


def auto_marks(words: list[dict]) -> list[dict]:
    """words: clip-relative [{start,end,word}] -> [{start,end,verdict}]"""
    toks: list[str] = []
    first_idx: list[int] = []   # word index where each merged token starts / ends
    last_idx: list[int] = []
    for i, w in enumerate(words):   # glue Whisper pieces back together: don + 't -> don't
        t = _norm(w.get("word"))
        if toks and not w.get("sp", True):
            toks[-1] += t
            last_idx[-1] = i
        else:
            toks.append(t)
            first_idx.append(i)
            last_idx.append(i)
    found: list[dict] = []

    def overlaps(a, b):
        return any(a < m["end"] and b > m["start"] for m in found)

    hits = []  # (index_of_last_cue_token, cue, verdict)
    for verdict, cues in (("wrong", WRONG_CUES), ("right", RIGHT_CUES)):
        for cue in cues:
            n = len(cue)
            for i in range(len(toks) - n + 1):
                if tuple(toks[i:i + n]) == cue:
                    hits.append((i + n - 1, cue, verdict))
    for last_i, cue, verdict in sorted(hits):
        t_end = words[last_idx[last_i]]["end"]
        t_start = words[first_idx[last_i - len(cue) + 1]]["start"]
        run = _run_after(words, t_end)
        if run is None and cue in BACKWARD_OK:
            run = _run_before(words, t_start)
        if run and not overlaps(*run):
            found.append({"start": run[0], "end": run[1], "verdict": verdict})
    found.sort(key=lambda m: m["start"])
    return found


def clip_marks(clip: dict, words: list[dict], start: float) -> list[dict]:
    """Marks for one clip, relative to the cut start. Claude's marks win over auto-detection."""
    claude = clip.get("marks")
    if isinstance(claude, list) and claude:
        out = []
        for m in claude:
            try:
                out.append({"start": float(m["start"]) - start, "end": float(m["end"]) - start,
                            "verdict": "wrong" if str(m["verdict"]).lower().startswith("w") else "right"})
            except (KeyError, TypeError, ValueError):
                continue
        return out
    return auto_marks(words)


def sfx_for(marks: list[dict]) -> list[dict]:
    """Buzzer on every wrong mark, ding on every right mark (at the first word)."""
    return [{"t": round(m["start"], 2), "kind": "buzzer" if m["verdict"] == "wrong" else "ding"}
            for m in marks if m["start"] >= 0]
