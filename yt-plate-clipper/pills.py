"""Topper pills (black EN + orange JP) as ASS vector shapes.

Ported from the proven .tmp-batchD3 / .tmp-batchE1 pipelines so the look matches
JD's existing Shorts: black rounded pill on top, orange stadium pill tucked under it.
"""
from __future__ import annotations

from pathlib import Path

from PIL import ImageFont

BLACK = "&H00000000"
ORANGE = "&H00233CEE"  # #ee3c23

TOP_EN_SIZE = 112
TOP_JP_SIZE = 140
PAD_X, PAD_Y = 0.32, 0.22
PAD_X_JP, PAD_Y_JP = 0.28, 0.20
ORANGE_CORNER = 0.50
ORANGE_UNDERLAP = 18
LINE_GAP = 0.10
CORNER_R = 0.24
TOP_Y = 155.0
MAX_W = 1000.0

_FONT = Path(__file__).parent / "assets" / "fonts" / "YuGothB.ttc"


def text_width(text: str, fontsize: float) -> float:
    try:
        f = ImageFont.truetype(str(_FONT), int(round(fontsize)), index=0)
        return float(f.getlength(text))
    except Exception:
        return sum(fontsize * (1.0 if ord(c) > 0x2E80 else 0.52) for c in text)


def rounded_rect_path(width: float, height: float, corner_frac: float = CORNER_R) -> str:
    k = 0.55228475
    w = max(width, height * 0.5)
    r = min(height * corner_frac, w * 0.45, height * 0.49)
    rk = r * k
    if corner_frac >= 0.49:  # full stadium
        w = max(w, height)
        r = height / 2.0
        rk = r * k
        return (
            f"m {r:.2f} 0 l {w - r:.2f} 0 "
            f"b {w - r + rk:.2f} 0 {w:.2f} {r - rk:.2f} {w:.2f} {r:.2f} "
            f"b {w:.2f} {r + rk:.2f} {w - r + rk:.2f} {height:.2f} {w - r:.2f} {height:.2f} "
            f"l {r:.2f} {height:.2f} "
            f"b {r - rk:.2f} {height:.2f} 0 {r + rk:.2f} 0 {r:.2f} "
            f"b 0 {r - rk:.2f} {r - rk:.2f} 0 {r:.2f} 0"
        )
    return (
        f"m {r:.2f} 0 l {w - r:.2f} 0 "
        f"b {w - r + rk:.2f} 0 {w:.2f} {r - rk:.2f} {w:.2f} {r:.2f} "
        f"l {w:.2f} {height - r:.2f} "
        f"b {w:.2f} {height - r + rk:.2f} {w - r + rk:.2f} {height:.2f} {w - r:.2f} {height:.2f} "
        f"l {r:.2f} {height:.2f} "
        f"b {r - rk:.2f} {height:.2f} 0 {height - r + rk:.2f} 0 {height - r:.2f} "
        f"l 0 {r:.2f} b 0 {r - rk:.2f} {r - rk:.2f} 0 {r:.2f} 0"
    )


def pill_size(text: str, fontsize: float, px=None, py=None, min_round=False):
    """(width, height, lines, fontsize actually used). Long text shrinks, never stretches."""
    fs = float(fontsize)
    px = PAD_X if px is None else px
    py = PAD_Y if py is None else py
    lines = [ln for ln in text.replace("\\N", "\n").split("\n") if ln != ""]
    pw = ph = 0.0
    for _ in range(10):
        pad_x, pad_y, gap = fs * px, fs * py, fs * LINE_GAP
        tw = max(text_width(ln, fs) for ln in lines)
        ph = pad_y * 2 + fs * len(lines) + gap * max(0, len(lines) - 1)
        pw = tw + pad_x * 2
        pw = max(pw, ph) if min_round else max(pw, ph * 0.85)
        if pw <= MAX_W + 0.5:
            break
        fs *= MAX_W / pw
    return pw, ph, lines, fs


def _pill(start: str, end: str, text: str, fontsize: int, fill: str, top_y: float,
          layer_bg: int, layer_fg: int, px=None, py=None, corner=None):
    cf = CORNER_R if corner is None else corner
    pw, ph, lines, fs = pill_size(text, fontsize, px, py, min_round=(cf >= 0.49))
    left = 540 - pw / 2
    cy = top_y + ph / 2
    bgr = fill[4:]
    bg = (f"Dialogue: {layer_bg},{start},{end},Pill,,0,0,0,,"
          f"{{\\an7\\pos({left:.1f},{top_y:.1f})\\p1\\c&H{bgr}&\\alpha&H00&\\bord0\\shad0}}"
          f"{rounded_rect_path(pw, ph, cf)}{{\\p0}}")
    fg = (f"Dialogue: {layer_fg},{start},{end},TopText,,0,0,0,,"
          f"{{\\an5\\pos(540,{cy:.1f})\\fs{fs:.1f}\\fscx100\\b1}}" + "\\N".join(lines))
    return [bg, fg], ph


def topper_events(en: str, jp: str, start: str, end: str) -> list[str]:
    """Black EN pill on top; orange JP pill tucked underneath. Either may be empty."""
    events: list[str] = []
    black_h = 0.0
    if en:
        _, black_h, _, _ = pill_size(en, TOP_EN_SIZE)
    if jp:
        top = TOP_Y + black_h - (ORANGE_UNDERLAP if en else 0)
        ev, _ = _pill(start, end, jp, TOP_JP_SIZE, ORANGE, top, 0, 1,
                      PAD_X_JP, PAD_Y_JP, ORANGE_CORNER)
        events += ev
    if en:
        ev, _ = _pill(start, end, en, TOP_EN_SIZE, BLACK, TOP_Y, 2, 3)
        events += ev
    return events
