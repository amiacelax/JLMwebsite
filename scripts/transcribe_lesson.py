#!/usr/bin/env python3
"""
Transcribe a lesson video with local Whisper (free, no API key).
Usage:
  python scripts/transcribe_lesson.py "E:\\OBS Recording New\\2026-05-22 Ben M 24.mp4"
  python scripts/transcribe_lesson.py "path\\to\\lesson.mp4" --model small
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe lesson video (local Whisper)")
    parser.add_argument("video", type=Path, help="Path to .mp4 / .mov / .mkv")
    parser.add_argument(
        "--model",
        default="small",
        choices=["tiny", "base", "small", "medium", "large-v3"],
        help="Larger = better Japanese, slower (default: small)",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="Force language code (ja, en). Default: auto-detect per segment",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output folder (default: same folder as video)",
    )
    args = parser.parse_args()

    video = args.video.expanduser().resolve()
    if not video.is_file():
        print(f"File not found: {video}", file=sys.stderr)
        return 1

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "Missing faster-whisper. Install once:\n"
            "  pip install faster-whisper\n",
            file=sys.stderr,
        )
        return 1

    out_dir = (args.out_dir or video.parent).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = video.stem
    txt_path = out_dir / f"{stem}-transcript.txt"
    vtt_path = out_dir / f"{stem}-transcript.vtt"

    print(f"Loading model '{args.model}' (first run downloads weights — may take a few minutes)...")
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    print(f"Transcribing: {video.name}")
    print("(65 min on CPU can take 30–90+ min with 'small'; use 'base' for a faster test.)")

    segments, info = model.transcribe(
        str(video),
        language=args.language,
        vad_filter=True,
        initial_prompt=(
            "Japanese language lesson. The teacher speaks English and Japanese. "
            "Student names and grammar examples in Japanese."
        ),
    )

    print(f"Detected language: {info.language} (probability {info.language_probability:.2f})")

    lines: list[str] = []
    vtt_lines: list[str] = ["WEBVTT", ""]
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        ts_start = format_timestamp(seg.start)
        ts_end = format_timestamp(seg.end)
        lines.append(f"[{ts_start} → {ts_end}] {text}")
        vtt_lines.append(f"{format_vtt(seg.start)} --> {format_vtt(seg.end)}")
        vtt_lines.append(text)
        vtt_lines.append("")

    header = (
        f"# Transcript — {video.name}\n"
        f"# Generated {datetime.now().isoformat(timespec='seconds')}\n"
        f"# Model: {args.model} | language arg: {args.language or 'auto'}\n\n"
    )
    txt_path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    vtt_path.write_text("\n".join(vtt_lines) + "\n", encoding="utf-8")

    print(f"\nDone.\n  {txt_path}\n  {vtt_path}")
    return 0


def format_timestamp(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{sec:02d}"
    return f"{m}:{sec:02d}"


def format_vtt(seconds: float) -> str:
    s = int(seconds)
    ms = int((seconds - s) * 1000)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec:02d}.{ms:03d}"


if __name__ == "__main__":
    raise SystemExit(main())
