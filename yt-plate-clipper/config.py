"""YT Plate Clipper — shared config / paths / tiny .env loader.

Standalone workflow. Does NOT touch the JLM Website site or Worker code.
Phase 1 scope: weekday watcher -> Whisper -> Claude clip candidates -> review ping.
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

# --- Core paths --------------------------------------------------------------
REPO = Path(r"C:\JLM Website")
CLIPPER_DIR = REPO / "yt-plate-clipper"

# Where OBS ("YT Plate (no chroma)" Source Record filter) saves the raw greenscreen
# plates by itself. JD never moves files. The weekly check lists new ones from here.
WATCH_DIR = Path(r"F:\OBS Recording New\YT-Plate")
# Plates shorter than this (seconds) are OBS test blips, not lessons.
MIN_PLATE_SECONDS = 180

# Backgrounds for Phase 2 compositing (read-only reference in Phase 1).
BG_DIR = Path(r"F:\External HD Copy\Business\Lessons\zzBackgrounds")
# One background per season. JD swaps these when the season changes.
# (Sep-Nov = autumn.) Add winter/spring/summer picks here when JD chooses them.
SEASON_BG = {
    "autumn": "autumngif.gif",
}
BG_FALLBACK = "autumngif.gif"
BG_ALT = "rainy.gif"
# Skip watermarked backgrounds unless cropped. (winter river.gif = @anasabdin watermark)
BG_SKIP = {"winter river.gif"}


def current_season(now: datetime | None = None) -> str:
    """Northern-hemisphere seasons by month (Japan): Mar-May spring, Jun-Aug summer,
    Sep-Nov autumn, Dec-Feb winter."""
    m = (now or datetime.now()).month
    if m in (3, 4, 5):
        return "spring"
    if m in (6, 7, 8):
        return "summer"
    if m in (9, 10, 11):
        return "autumn"
    return "winter"


def current_background(now: datetime | None = None) -> Path:
    """Season's background file; falls back to BG_FALLBACK if the season isn't set yet."""
    name = SEASON_BG.get(current_season(now), BG_FALLBACK)
    return BG_DIR / name

# Working + state areas (git-ignored).
WORK = CLIPPER_DIR / "work"
STATE = CLIPPER_DIR / "state"
PROCESSED_JSON = STATE / "processed.json"
META_JSON = STATE / "meta.json"        # last weekly check time etc.
QUEUE_JSON = STATE / "queue.json"      # numbered list from the latest weekly check
LOG_FILE = STATE / "clipper.log"
RULES_JSON = CLIPPER_DIR / "rules.json"  # time-of-day auto-skip rules (editable)

# The ping script (single source of truth, same path as the shorts workflow rule).
ARM_SOCIAL_SCRIPT = REPO / "scripts" / "arm-social-reminder.mjs"

# --- Behavior knobs ----------------------------------------------------------
VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".flv", ".ts", ".m4v", ".webm"}
POLL_SECONDS = 30
# Weekly check: Friday (Mon=0 ... Fri=4) at/after this local hour (JST), list the folder + ping.
DIGEST_WEEKDAY = 4
DIGEST_HOUR = 13
DIGEST_MINUTE = 30
# How many consecutive equal-size polls before a file is considered "done moving".
STABLE_CHECKS = 3

# Whisper model: "small" matches the existing batch scripts; override via env.
WHISPER_MODEL = os.environ.get("YT_CLIPPER_WHISPER_MODEL", "small")

# Claude backend: "cursor" (default, $0 extra), "cli" (claude -p), or "api" (ANTHROPIC_API_KEY).
CLAUDE_BACKEND = os.environ.get("YT_CLIPPER_CLAUDE_BACKEND", "cursor").strip().lower()
CLAUDE_MODEL = os.environ.get("YT_CLIPPER_CLAUDE_MODEL", "claude-sonnet-4-5")

# Review ping on/off (set to "0" to silence Discord/Hub during testing).
PING_ENABLED = os.environ.get("YT_CLIPPER_PING", "1").strip() != "0"
TEACHER_USER = os.environ.get("YT_CLIPPER_TEACHER", "jlm")

# --- Brand constants (from shorts-reel-post-workflow.mdc) ---------------------
OFFER = "Book a trial lesson"
CTA_URL = "https://japaneselanguagementor.com/#contact"


def _load_env_file() -> None:
    """Load yt-plate-clipper/.env (git-ignored) into os.environ if present.

    Only sets keys that aren't already in the environment. Keeps secrets like
    ANTHROPIC_API_KEY out of git while staying usable by the headless watcher.
    """
    env_path = CLIPPER_DIR / ".env"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


_load_env_file()
# Re-read env-driven knobs after loading .env.
WHISPER_MODEL = os.environ.get("YT_CLIPPER_WHISPER_MODEL", WHISPER_MODEL)
CLAUDE_BACKEND = os.environ.get("YT_CLIPPER_CLAUDE_BACKEND", CLAUDE_BACKEND).strip().lower()
CLAUDE_MODEL = os.environ.get("YT_CLIPPER_CLAUDE_MODEL", CLAUDE_MODEL)
PING_ENABLED = os.environ.get("YT_CLIPPER_PING", "1" if PING_ENABLED else "0").strip() != "0"
TEACHER_USER = os.environ.get("YT_CLIPPER_TEACHER", TEACHER_USER)
DIGEST_WEEKDAY = int(os.environ.get("YT_CLIPPER_DIGEST_WEEKDAY", DIGEST_WEEKDAY))
DIGEST_HOUR = int(os.environ.get("YT_CLIPPER_DIGEST_HOUR", DIGEST_HOUR))
DIGEST_MINUTE = int(os.environ.get("YT_CLIPPER_DIGEST_MINUTE", DIGEST_MINUTE))

# Test sandbox: point watch/work/state at a scratch folder so tests never touch
# the real folder, real state, or Discord.
_sandbox = os.environ.get("YT_CLIPPER_SANDBOX", "").strip()
if _sandbox:
    _sb = Path(_sandbox)
    WATCH_DIR = _sb / "watch"
    WORK = _sb / "work"
    STATE = _sb / "state"
    PROCESSED_JSON = STATE / "processed.json"
    META_JSON = STATE / "meta.json"
    QUEUE_JSON = STATE / "queue.json"
    LOG_FILE = STATE / "clipper.log"


def ensure_dirs() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    STATE.mkdir(parents=True, exist_ok=True)


def is_weekday(now: datetime | None = None) -> bool:
    """Mon-Fri only (local time = JST on this machine). Mon=0 ... Sun=6."""
    now = now or datetime.now()
    return now.weekday() < 5


def log(msg: str) -> None:
    """Append a timestamped line to the clipper log and stdout."""
    ensure_dirs()
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass
