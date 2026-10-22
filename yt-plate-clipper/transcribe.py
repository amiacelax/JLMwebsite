"""Whisper transcription for YT Plate Clipper.

Extracts 16k mono audio with ffmpeg, then transcribes with faster-whisper
using word-level timestamps (so Phase 2 can cut precisely). Mirrors the pattern
in .tmp-batch*/transcribe_*.py and scripts/transcribe_lesson.py.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from config import WHISPER_MODEL, log

LESSON_PROMPT = (
    "Japanese language lesson. The teacher speaks English and Japanese. "
    "Student names and grammar examples in Japanese."
)


def extract_audio(video: Path, out_wav: Path) -> None:
    """16 kHz mono WAV — fast + reliable input for Whisper."""
    cmd = [
        "ffmpeg", "-y", "-i", str(video),
        "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", str(out_wav),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def transcribe(video: Path, work_dir: Path, model_name: str | None = None) -> dict:
    """Transcribe a plate. Writes transcript.txt + words.json into work_dir.

    Returns the parsed result dict: {"segments": [...], "duration": float}.
    Each segment: {start, end, text, words:[{start,end,word}]}.
    """
    from faster_whisper import WhisperModel

    work_dir.mkdir(parents=True, exist_ok=True)
    wav = work_dir / "audio.wav"
    if not wav.exists():
        log(f"transcribe: extracting audio -> {wav.name}")
        extract_audio(video, wav)

    name = model_name or WHISPER_MODEL
    log(f"transcribe: loading Whisper model '{name}' (first run downloads weights)")
    model = WhisperModel(name, device="cpu", compute_type="int8")

    log(f"transcribe: running on {video.name}")
    segments, info = model.transcribe(
        str(wav),
        language=None,  # auto-detect per clip (EN teacher + JP examples)
        vad_filter=True,
        word_timestamps=True,
        beam_size=5,
        initial_prompt=LESSON_PROMPT,
    )

    rows: list[dict] = []
    txt_lines: list[str] = []
    duration = 0.0
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        words = []
        for w in seg.words or []:
            t = (w.word or "").strip()
            if not t:
                continue
            words.append({
                "start": round(float(w.start), 3),
                "end": round(float(w.end), 3),
                "word": t,
                "sp": (w.word or "").startswith(" "),   # False = glued to the previous piece (don + 't)
            })
        rows.append({
            "start": round(float(seg.start), 3),
            "end": round(float(seg.end), 3),
            "text": text,
            "words": words,
        })
        txt_lines.append(f"[{seg.start:07.1f}-{seg.end:07.1f}] {text}")
        duration = max(duration, float(seg.end))

    result = {
        "video": str(video),
        "language": getattr(info, "language", None),
        "duration": round(duration, 2),
        "model": name,
        "segments": rows,
    }

    (work_dir / "transcript.txt").write_text("\n".join(txt_lines) + "\n", encoding="utf-8")
    (work_dir / "words.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log(f"transcribe: done — {len(rows)} segments, ~{duration:.0f}s, lang={result['language']}")
    return result
