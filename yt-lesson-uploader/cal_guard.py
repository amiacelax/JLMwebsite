"""Calendar-aware timing: if a lesson is still going when the uploader starts, wait until it's over.

The daily uploader runs at 3:45 PM. If JD moves a lesson on his Google Calendar (e.g. CJ 2-4 PM today), the upload
should wait for it instead of reporting "still recording". Read-only, never prompts for a sign-in, and any failure
just means "don't wait" (the uploader then behaves exactly as before).
"""
from __future__ import annotations

import datetime as dt
import time
from pathlib import Path

from settings import log

HERE = Path(__file__).parent
TOKEN = HERE / "token_calendar.json"
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events"]
JST = dt.timezone(dt.timedelta(hours=9))
MIN_LESSON_MIN = 45      # shorter timed events (errands, check-ins) don't count as lessons
BUFFER_MIN = 45          # the uploader normally runs 45 min after the usual 3 PM end
MAX_WAIT_HOURS = 3.5


def _service():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    c = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if c.expired and c.refresh_token:
        c.refresh(Request())
        TOKEN.write_text(c.to_json(), encoding="utf-8")
    return build("calendar", "v3", credentials=c, cache_discovery=False)


def wait_until(now: dt.datetime | None = None) -> dt.datetime | None:
    """End of the lesson in progress (or ending within the buffer) + buffer, or None if nothing to wait for."""
    now = now or dt.datetime.now(JST)
    try:
        cal = _service()
        r = cal.events().list(
            calendarId="primary", timeMin=(now - dt.timedelta(hours=1)).isoformat(),
            timeMax=(now + dt.timedelta(hours=6)).isoformat(), singleEvents=True, orderBy="startTime",
            fields="items(status,transparency,start,end,summary)").execute()
    except Exception as e:                                   # no token / offline / API off: behave as before
        log(f"cal_guard: calendar not available ({e!r}); not waiting")
        return None
    best = None
    for e in r.get("items", []):
        if e.get("status") == "cancelled" or e.get("transparency") == "transparent":
            continue
        s, en = e["start"].get("dateTime"), e["end"].get("dateTime")
        if not s or not en:
            continue                                         # all-day = reminder
        start, end = dt.datetime.fromisoformat(s), dt.datetime.fromisoformat(en)
        if (end - start) < dt.timedelta(minutes=MIN_LESSON_MIN):
            continue
        ready = end + dt.timedelta(minutes=BUFFER_MIN)
        if start <= now < ready:                             # lesson in progress, or finished <45 min ago
            if best is None or ready > best:
                best = ready
    return best


def wait_for_lessons() -> None:
    """Sleep until today's lessons (as shown on JD's calendar) are over. Re-checks for back-to-back lessons."""
    limit = dt.datetime.now(JST) + dt.timedelta(hours=MAX_WAIT_HOURS)
    while True:
        until = wait_until()
        if not until or until > limit:
            return
        secs = (until - dt.datetime.now(JST)).total_seconds()
        if secs <= 0:
            return
        log(f"cal_guard: lesson on calendar until {until - dt.timedelta(minutes=BUFFER_MIN):%H:%M}; "
            f"waiting until {until:%H:%M}")
        time.sleep(min(secs, 900) + 5)                       # wake every 15 min in case JD moves things again
