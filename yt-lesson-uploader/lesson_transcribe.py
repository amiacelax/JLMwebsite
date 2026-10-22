"""Whole-lesson Whisper transcript (segments + timestamps) cached in work/<name>/transcript.json."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import settings
from settings import log


def work_dir(video: Path) -> Path:
    safe = re.sub(r"[^\w\- ]+", "_", video.stem).strip()
    d = settings.WORK / safe
    d.mkdir(parents=True, exist_ok=True)
    return d


def probe_duration(video: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(video)], capture_output=True, text=True)
    try:
        return float(p.stdout.strip())
    except ValueError:
        return 0.0


def transcribe(video: Path) -> dict:
    wd = work_dir(video)
    out = wd / "transcript.json"
    if out.is_file():
        return json.loads(out.read_text(encoding="utf-8"))

    wav = wd / "audio.wav"
    log(f"transcribe: extracting audio from {video.name}")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-vn", "-ac", "1",
                    "-ar", "16000", str(wav)], check=True)
    from faster_whisper import WhisperModel
    log("transcribe: running Whisper 'small' (about 1/3 of the lesson length)")
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, info = model.transcribe(str(wav), vad_filter=True)
    rows = [{"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.replace("\ufffd", "").strip()}
            for s in segs if s.text.strip()]
    data = {"video": str(video), "language": info.language, "duration": round(info.duration, 1),
            "segments": rows}
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        wav.unlink()
    except OSError:
        pass
    log(f"transcribe: done, {len(rows)} segments")
    return data


def full_text(data: dict) -> str:
    return "\n".join(s["text"] for s in data["segments"])


def timed_text(data: dict) -> str:
    """'[12:05] text' lines for the Claude prompt."""
    lines = []
    for s in data["segments"]:
        t = int(s["start"])
        lines.append(f"[{t // 60}:{t % 60:02d}] {s['text']}")
    return "\n".join(lines)
