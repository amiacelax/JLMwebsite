"""Google Calendar (read + add events) for languagementor.jp@gmail.com.

python gcal.py auth                one-time sign-in (opens a browser; pick languagementor.jp@gmail.com)
python gcal.py calendars           list every calendar on the account
python gcal.py week [--days 28]    upcoming events (all calendars), newest-first-to-come
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

HERE = Path(__file__).parent
CLIENT_SECRET = HERE / "client_secret.json"
TOKEN = HERE / "token_calendar.json"
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events"]      # read schedule + add booked lessons


def creds() -> Credentials:
    c = None
    if TOKEN.is_file():
        c = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
        if c.expired and c.refresh_token:
            c.refresh(Request())
            TOKEN.write_text(c.to_json(), encoding="utf-8")
    if not c or not c.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
        c = flow.run_local_server(port=0, prompt="consent", login_hint="languagementor.jp@gmail.com")
        TOKEN.write_text(c.to_json(), encoding="utf-8")
    return c


def service():
    return build("calendar", "v3", credentials=creds())


def calendars() -> None:
    for c in service().calendarList().list().execute().get("items", []):
        print(f"{c['summary']}  |  {c['id']}  |  {c.get('accessRole')}")


def week(days: int) -> None:
    cal = service()
    now = dt.datetime.now(dt.timezone.utc)
    end = now + dt.timedelta(days=days)
    for c in cal.calendarList().list().execute().get("items", []):
        ev = cal.events().list(calendarId=c["id"], timeMin=now.isoformat(), timeMax=end.isoformat(),
                               singleEvents=True, orderBy="startTime", maxResults=100).execute().get("items", [])
        if not ev:
            continue
        print(f"== {c['summary']}")
        for e in ev:
            s = e["start"].get("dateTime", e["start"].get("date"))
            print(f"  {s[:16].replace('T', ' ')}  {e.get('summary', '(no title)')}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["auth", "calendars", "week"])
    ap.add_argument("--days", type=int, default=28)          # always look 4 weeks ahead (monthly students)
    a = ap.parse_args()
    if a.cmd == "auth":
        creds()
        print("signed in")
    elif a.cmd == "calendars":
        calendars()
    else:
        week(a.days)
    return 0


if __name__ == "__main__":
    sys.exit(main())
