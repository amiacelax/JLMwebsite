"""Phase 2: turn approved clip picks into finished 1080x1920 H.264/AAC drafts.

For each clip in work/<lesson>/candidates.json:
  cut from the greenscreen plate -> key + composite on the season background ->
  last 2s blur while picture and audio keep playing -> burn captions/toppers/CTA ->
  YT file ("...-yt.mp4") + IG twin ("...-ig.mp4", URL line says "link in bio").

Drafts only. Nothing is posted anywhere.

  python compose.py draft "work\\<lesson>" [--only 1,2] [--bg path\\to.gif]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import captions
import config
import keyer
import marks as marks_mod
from config import log

PRE_ROLL = 0.15
POST_ROLL = 0.20
CTA_HOLD = 2.0          # seconds of blurred end card after the speech
SFX_DIR = Path(__file__).parent / "assets" / "sfx"
SFX_VOLUME = 0.5        # buzzer/ding level against the voice
FONT_FILES = ("OpenSans-Regular.ttf", "OpenSans-Bold.ttf", "YuGothR.ttc", "YuGothM.ttc", "YuGothB.ttc")


def _slug(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return s[:40] or "clip"


def _run(cmd: list[str], cwd: Path) -> None:
    proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.strip()[-600:]}")


def _plate_info(work_dir: Path, plate: Path) -> dict:
    cache = work_dir / "plate_info.json"
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    info = keyer.analyze(plate)
    cache.write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info


EDIT_HEADER = """# CLIP {rank} [{tag}]  source {source}
# This file is the caption script for this clip. Edit it, then re-render:
#   python compose.py draft "work\\{lesson}" --only {rank}
# - Color a spoken phrase: {{あついで:red}} = wrong, {{あつくて:green}} = right
#   (also blue / orange / gold / white). Remove the braces to uncolor.
# - '@ start end' = when that caption is on screen (seconds from clip start).
# - '@sfx seconds buzzer' or '@sfx seconds ding' = sound effect. Delete the line to remove it.
# - Do not type , . ; : ― 、 。 (they never show on screen).
# - To throw this away and rebuild from the transcript: add --regen
"""


def write_edit_txt(path: Path, clip: dict, source_tag: str, slides: list[dict], sfx: list[dict]) -> None:
    lines = [EDIT_HEADER.format(rank=clip.get("rank", "?"), tag=clip.get("tag", ""),
                                source=source_tag, lesson=path.parent.parent.name), ""]
    for s in slides:
        lines.append(f"@ {s['start']:.2f} {s['end']:.2f}")
        lines.extend(s["lines"])
        lines.append("")
    for x in sfx:
        lines.append(f"@sfx {x['t']:.2f} {x['kind']}")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def read_edit_txt(path: Path, source_tag: str):
    """Parse an (edited) captions txt. None if missing or it belongs to a different cut."""
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8-sig")
    m = re.search(r"source\s+([\d.]+-[\d.]+)", text)
    if not m or m.group(1) != source_tag:
        return None
    slides, sfx, cur = [], [], None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#"):
            continue
        ms = re.match(r"@sfx\s+([\d.]+)\s+(\w+)", line)
        if ms:
            cur = None
            sfx.append({"t": float(ms.group(1)), "kind": ms.group(2).lower()})
            continue
        mh = re.match(r"@\s+([\d.]+)\s+([\d.]+)", line)
        if mh:
            cur = {"start": float(mh.group(1)), "end": float(mh.group(2)), "lines": []}
            slides.append(cur)
            continue
        if not line:
            cur = None
            continue
        if cur is not None:
            clean = captions.clean_markup(line)
            plain = captions.TAG_RE.sub(lambda m: m.group(1), clean)
            if captions.width(plain) > captions.MAX_LINE_PX + 60:
                log(f"compose:   WARNING line too wide, the screen will wrap it: {plain}")
            cur["lines"].append(clean)
    slides = [s for s in slides if s["lines"]]
    return slides, sfx


def render_clip(plate: Path, words: list[dict], clip: dict, out_dir: Path, name: str,
                info: dict, background: Path, regen: bool = False) -> dict:
    """Returns {"yt": path, "ig": path, "seconds": float}."""
    start = max(0.0, float(clip["start"]) - PRE_ROLL)
    end = float(clip["end"]) + POST_ROLL
    dur = end - start
    total = dur + CTA_HOLD

    build = out_dir / f"_build-{name}"
    if build.exists():
        shutil.rmtree(build)
    (build / "fonts").mkdir(parents=True)
    for f in FONT_FILES:
        shutil.copy2(captions._FONTS / f, build / "fonts" / f)

    # 1) master: key + composite. Last 2s blur on top of the real next frames and audio.
    bx, by, bw, bh = keyer.bg_trim_box(background)
    fc = (
        f"[0:v]crop={keyer.SQUARE}:{keyer.SQUARE}:{info['crop_x']}:0,"
        f"chromakey=color={info['green_hex']}:similarity={keyer.SIMILARITY}:blend={keyer.BLEND},"
        f"despill=type=green:mix=0.6:expand=0.2,format=yuva420p[fg];"
        f"[1:v]crop={bw}:{bh}:{bx}:{by},fps=30,scale=-2:{keyer.OUT_H}:flags=neighbor,"
        f"crop={keyer.OUT_W}:{keyer.OUT_H},format=yuv420p[bg];"
        f"[bg][fg]overlay=0:{keyer.OUT_H - keyer.SQUARE}:shortest=1,format=yuv420p,"
        f"gblur=sigma=14:steps=2:enable='gte(t,{dur:.3f})'[v]"
    )
    master = build / "master.mp4"
    _run(["ffmpeg", "-y", "-loglevel", "error",
          "-ss", f"{start:.3f}", "-t", f"{total:.3f}", "-i", str(plate),
          "-stream_loop", "-1", "-i", str(background),
          "-filter_complex", fc, "-map", "[v]", "-map", "0:a",
          "-c:v", "libx264", "-preset", "fast", "-crf", "14",
          "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "master.mp4"], build)

    # 2) captions relative to the cut — auto (colors + sfx from marks) unless JD edited the .txt
    rel = [{"start": w["start"] - start, "end": w["end"] - start, "word": w["word"], "sp": w.get("sp", True)}
           for w in words if w["start"] >= start - 0.05 and w["start"] < end]
    out_dir.mkdir(parents=True, exist_ok=True)
    edit_path = out_dir / f"clip{int(clip.get('rank', 0)):02d}.captions.txt"
    source_tag = f"{float(clip['start']):.2f}-{float(clip['end']):.2f}"
    loaded = None if regen else read_edit_txt(edit_path, source_tag)
    if loaded:
        slides, sfx = loaded
        log(f"compose:   using your edited captions: {edit_path.name}")
    else:
        mk = marks_mod.clip_marks(clip, rel, start)
        slides = captions.build_slides(rel, mk)
        sfx = marks_mod.sfx_for(mk)
        write_edit_txt(edit_path, clip, source_tag, slides, sfx)
    sfx = [s for s in sfx if 0 <= s["t"] < dur and (SFX_DIR / f"{s['kind']}.wav").is_file()]
    en, jp = (clip.get("topper_en") or "").strip(), (clip.get("topper_jp") or "").strip()

    results = {"seconds": round(total, 1), "slides": len(slides), "sfx": len(sfx),
               "captions_txt": str(edit_path)}
    for plat, url in (("yt", "japaneselanguagementor.com"), ("ig", "link in bio")):
        ass = captions.build_ass(slides, total, dur, en.replace("\\n", "\n"), jp, url_text=url)
        (build / f"{plat}.ass").write_text(ass, encoding="utf-8-sig")
        tmp = f"{plat}.mp4"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", "master.mp4"]
        for s in sfx:
            cmd += ["-i", str(SFX_DIR / f"{s['kind']}.wav")]
        if sfx:
            fc2 = f"[0:v]ass={plat}.ass:fontsdir=fonts[v];"
            for k, s in enumerate(sfx, start=1):
                ms = int(round(s["t"] * 1000))
                fc2 += f"[{k}:a]adelay={ms}|{ms},volume={SFX_VOLUME}[s{k}];"
            fc2 += "[0:a]" + "".join(f"[s{k}]" for k in range(1, len(sfx) + 1)) + \
                   f"amix=inputs={len(sfx) + 1}:normalize=0:duration=first[a]"
            cmd += ["-filter_complex", fc2, "-map", "[v]", "-map", "[a]", "-c:a", "aac", "-b:a", "192k"]
        else:
            cmd += ["-vf", f"ass={plat}.ass:fontsdir=fonts", "-c:a", "copy"]
        cmd += ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", tmp]
        _run(cmd, build)
        dest = out_dir / f"{name}-{plat}.mp4"
        shutil.copy2(build / tmp, dest)
        results[plat] = str(dest)
    shutil.rmtree(build, ignore_errors=True)
    return results


def draft_lesson(work_dir: Path, only: set[int] | None = None, bg: Path | None = None,
                 regen: bool = False) -> int:
    cand_path = work_dir / "candidates.json"
    words_path = work_dir / "words.json"
    data = json.loads(cand_path.read_text(encoding="utf-8"))
    tr = json.loads(words_path.read_text(encoding="utf-8"))
    plate = Path(tr["video"]).resolve()
    captions.restore_spacing(tr["segments"])
    words = [w for seg in tr["segments"] for w in seg.get("words", [])]
    if not plate.is_file():
        raise RuntimeError(f"plate not found: {plate}")

    info = _plate_info(work_dir, plate)
    if not info.get("has_green"):
        raise RuntimeError(f"{plate.name} has no greenscreen — can't key it (skip this plate)")
    background = (bg or config.current_background()).resolve()
    log(f"compose: {plate.name} | green={info['green_hex']} crop_x={info['crop_x']} | bg={background.name}")

    out_dir = (work_dir / "drafts").resolve()
    for stale in out_dir.glob("_build-*"):
        shutil.rmtree(stale, ignore_errors=True)
    made = 0
    for clip in data.get("clips", []):
        rank = int(clip.get("rank", 0))
        if only and rank not in only:
            continue
        name = f"clip{rank:02d}-{clip.get('tag', 'clip')}-{_slug(clip.get('yt_title', ''))}".rstrip("-")
        log(f"compose: rendering #{rank} [{clip.get('tag')}] {clip['start']:.1f}-{clip['end']:.1f}s")
        res = render_clip(plate, words, clip, out_dir, name, info, background, regen)
        clip["drafts"] = {"yt": res["yt"], "ig": res["ig"], "captions_txt": res["captions_txt"]}
        log(f"compose:   -> {Path(res['yt']).name} ({res['seconds']}s, {res['slides']} caption slides, {res['sfx']} sfx)")
        made += 1
    cand_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return made


def main() -> int:
    ap = argparse.ArgumentParser(description="YT Plate Clipper — draft renderer")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("draft")
    d.add_argument("work_dir")
    d.add_argument("--only", help="comma list of clip ranks, e.g. 1,3")
    d.add_argument("--bg", help="override background file")
    d.add_argument("--regen", action="store_true", help="ignore the edited captions .txt, rebuild from the transcript")
    args = ap.parse_args()

    wd = Path(args.work_dir)
    if not wd.is_absolute():
        wd = config.CLIPPER_DIR / wd
    only = {int(x) for x in args.only.split(",")} if args.only else None
    n = draft_lesson(wd, only, Path(args.bg) if args.bg else None, args.regen)
    log(f"compose: {n} clip(s) drafted -> {wd / 'drafts'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
