"""Paths + knobs for the lesson uploader (standalone; not part of the website)."""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parent
CLIPPER_DIR = REPO / "yt-plate-clipper"      # only used to borrow its ping.py

WATCH_DIR = Path(os.environ.get("LESSON_WATCH_DIR", r"F:\OBS Recording New\YouTube Straight"))
WORK = HERE / "work"
STATE_DIR = HERE / "state"
STATE_JSON = STATE_DIR / "uploads.json"
STUDENTS_JSON = HERE / "students.json"
FOOTER_TXT = HERE / "description_footer.txt"
LOG_FILE = HERE / "uploader.log"
LOCK_PORT = 47654

# Test mode: LESSON_SANDBOX=<folder> keeps students/state in that folder, uploads PRIVATE with a TEST
# title, skips playlists and pings. Real counters in students.json are never touched.
SANDBOX = os.environ.get("LESSON_SANDBOX", "").strip()
if SANDBOX:
    STATE_DIR = Path(SANDBOX)
    STATE_JSON = STATE_DIR / "uploads.json"
    STUDENTS_JSON = STATE_DIR / "students.json"
    WATCH_DIR = Path(os.environ.get("LESSON_WATCH_DIR", str(STATE_DIR / "watch")))

MIN_LESSON_SECONDS = 15 * 60       # shorter recordings are not lessons (tests, clips) -> ignored
STABLE_MINUTES = 4                 # file must be untouched this long (OBS finished writing)
SLOT_WINDOW_MIN = 25               # recording start must be within +-25 min of a usual slot
PRIVACY = "private" if os.environ.get("LESSON_SANDBOX", "").strip() else "unlisted"


def _load_env() -> None:
    env = HERE / ".env"
    if not env.is_file():
        return
    for line in env.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()
CLAUDE_MODEL = os.environ.get("LESSON_CLAUDE_MODEL", "claude-sonnet-4-5")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
CURSOR_API_KEY = os.environ.get("CURSOR_API_KEY", "").strip()
CURSOR_MODEL = os.environ.get("LESSON_CURSOR_MODEL", "").strip()   # blank = newest Claude Sonnet available
PING_ENABLED = os.environ.get("LESSON_PING", "1") != "0" and not SANDBOX


def log(msg: str) -> None:
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
