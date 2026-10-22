"""Tiny JSON state helpers shared by watch.py / weekly.py / finalize.py.

processed.json: one record per video file, keyed by lowercase full path.
status values:
  queued               listed in a weekly check, waiting for JD's yes/no
  rule-skipped         matched a rules.json time-of-day rule (JD can still override)
  approved             JD said clip it -> watcher will transcribe + pick
  skipped              JD said no
  processing           being worked on right now
  awaiting-cursor-pick transcribed; Claude pick waits for Cursor (the $0 path)
  reviewed             candidates + review.md final, ping sent
  error                something failed (re-approve to retry)
"""
from __future__ import annotations

import json
from pathlib import Path

import config
from config import ensure_dirs


def _read(path: Path, default):
    if path.is_file():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default
    return default


def _write(path: Path, data) -> None:
    ensure_dirs()
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_processed() -> dict:
    return _read(config.PROCESSED_JSON, {})


def save_processed(state: dict) -> None:
    _write(config.PROCESSED_JSON, state)


def load_meta() -> dict:
    return _read(config.META_JSON, {})


def save_meta(meta: dict) -> None:
    _write(config.META_JSON, meta)


def load_queue() -> dict:
    return _read(config.QUEUE_JSON, {"items": []})


def save_queue(q: dict) -> None:
    _write(config.QUEUE_JSON, q)


def file_key(path: Path) -> str:
    return str(Path(path).resolve()).lower()


def work_dir_for(video: Path) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in " -_." else "_" for ch in Path(video).stem).strip()
    return config.WORK / (safe or "clip")
