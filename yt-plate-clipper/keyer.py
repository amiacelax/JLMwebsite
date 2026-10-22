"""Greenscreen removal + pixel-art background composite (Phase 2 building block).

Takes a raw greenscreen "plate" (1920x1080 webcam recording with a green wall),
auto-measures the green + finds where JD sits, keys him out, and composites him
onto the season's pixel-art background as a 1080x1920 vertical frame.

Tuned on real footage (2026-10-02 plate): chromakey similarity 0.08 / blend 0.03.
  0.06 leaves green haze in the dark corner, 0.10 starts eating the dark shirt,
  0.14 makes the face see-through.

Layout: background fills the 1080x1920 frame; JD is a sharp 1080x1080 square
(1:1 pixels, no upscaling blur) sitting at the bottom, leaving the upper area
open for toppers/captions in Phase 2b.

  python keyer.py analyze "<plate.mp4>"
  python keyer.py render  "<plate.mp4>" <start_sec> <dur_sec> "<out.mp4>" [background.gif]
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

import config

SIMILARITY = 0.08
BLEND = 0.03
SQUARE = 1080
OUT_W, OUT_H = 1080, 1920


# --- frame sampling ----------------------------------------------------------
def _frame(src: Path, t: float, tmp: Path) -> np.ndarray:
    out = tmp / f"f_{int(t)}.png"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", str(src),
         "-frames:v", "1", str(out)], check=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.int16)


def _greenish(a: np.ndarray) -> np.ndarray:
    """Pixels clearly greener than red/blue = the screen."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (g > r + 25) & (g > b + 45) & (g > 70)


def _duration(src: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(src)], capture_output=True, text=True).stdout
    return float(out.strip() or 0)


# --- analysis ----------------------------------------------------------------
def analyze(src: Path, samples: int = 6) -> dict:
    """Is there a greenscreen? What exact green? Where is JD standing?"""
    dur = _duration(src)
    times = [dur * (i + 1) / (samples + 1) for i in range(samples)]
    with tempfile.TemporaryDirectory() as td:
        frames = [_frame(src, t, Path(td)) for t in times]

    masks = [_greenish(f) for f in frames]
    green_frac = float(np.mean([m.mean() for m in masks]))
    if green_frac < 0.15:
        return {"has_green": False, "green_frac": round(green_frac, 3)}

    # Exact green: median colour of the screen pixels (lighting differs per session).
    px = np.concatenate([f[m] for f, m in zip(frames, masks)])
    r, g, b = (int(np.median(px[:, i])) for i in range(3))

    # Screen span: columns that are mostly green in the top half (no body there).
    col_green = np.mean([m[: m.shape[0] // 2].mean(axis=0) for m in masks], axis=0)
    cols = np.where(col_green > 0.5)[0]
    left, right = int(cols.min()), int(cols.max())

    # JD = non-green pixels inside the screen span, head/shoulder rows only.
    xs = []
    for m in masks:
        sub = ~m[: int(m.shape[0] * 0.75), left:right + 1]
        ys, xx = np.nonzero(sub)
        if len(xx):
            xs.append(np.median(xx) + left)
    center = float(np.median(xs)) if xs else (left + right) / 2
    crop_x = int(round(center - SQUARE / 2))
    crop_x = max(0, min(crop_x, 1920 - SQUARE))
    return {
        "has_green": True,
        "green_frac": round(green_frac, 3),
        "green_hex": f"0x{r:02X}{g:02X}{b:02X}",
        "screen_x": [left, right],
        "person_center_x": round(center),
        "crop_x": crop_x,
        # does the square stay inside the green? (else a wall edge would show)
        "square_inside_green": crop_x >= left - 5 and crop_x + SQUARE <= right + 5,
    }


# --- background --------------------------------------------------------------
def bg_trim_box(gif: Path) -> tuple[int, int, int, int]:
    """(x, y, w, h) with dark border rows/cols trimmed (some GIFs ship a black edge)."""
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "bg.png"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(gif),
                        "-frames:v", "1", str(out)], check=True)
        a = np.asarray(Image.open(out).convert("L")).astype(np.int16)
    h, w = a.shape
    dark_r = a.mean(axis=1) < 7   # the GIF border is flat ~5; real dark scenery is higher
    dark_c = a.mean(axis=0) < 7
    top = 0
    while top < h // 4 and dark_r[top]:
        top += 1
    bot = 0
    while bot < h // 4 and dark_r[h - 1 - bot]:
        bot += 1
    lef = 0
    while lef < w // 4 and dark_c[lef]:
        lef += 1
    rig = 0
    while rig < w // 4 and dark_c[w - 1 - rig]:
        rig += 1
    return lef, top, w - lef - rig, h - top - bot


# --- render ------------------------------------------------------------------
def render(src: Path, start: float, dur: float, out: Path,
           background: Path | None = None, info: dict | None = None) -> Path:
    info = info or analyze(src)
    if not info.get("has_green"):
        raise RuntimeError(f"no greenscreen found in {src.name} â€” can't key it")
    bg = background or config.current_background()
    bx, by, bw, bh = bg_trim_box(bg)

    fc = (
        f"[0:v]crop={SQUARE}:{SQUARE}:{info['crop_x']}:0,"
        f"chromakey=color={info['green_hex']}:similarity={SIMILARITY}:blend={BLEND},"
        f"despill=type=green:mix=0.6:expand=0.2,format=yuva420p[fg];"
        f"[1:v]crop={bw}:{bh}:{bx}:{by},fps=30,scale=-2:{OUT_H}:flags=neighbor,"
        f"crop={OUT_W}:{OUT_H},format=yuv420p[bg];"
        f"[bg][fg]overlay=0:{OUT_H - SQUARE}:shortest=1,format=yuv420p[v]"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-ss", str(start), "-t", str(dur), "-i", str(src),
         "-stream_loop", "-1", "-i", str(bg),
         "-filter_complex", fc, "-map", "[v]", "-map", "0:a",
         "-c:v", "libx264", "-preset", "fast", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-t", str(dur), str(out)],
        check=True)
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    cmd, src = sys.argv[1], Path(sys.argv[2])
    if cmd == "analyze":
        import json
        print(json.dumps(analyze(src), indent=2))
        return 0
    if cmd == "render":
        start, dur, out = float(sys.argv[3]), float(sys.argv[4]), Path(sys.argv[5])
        bg = Path(sys.argv[6]) if len(sys.argv) > 6 else None
        render(src, start, dur, out, bg)
        print(f"wrote {out}")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())

