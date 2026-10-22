"""Fire pings via the existing social-reminders API (Discord + Teacher Hub).

Same path as scripts/arm-social-reminder.mjs. We fire "now" so the Worker's
`* * * * *` cron delivers within ~1 minute. The four copyable blocks are
repurposed (title / pin / story / link) — nothing posts to YouTube/Instagram.
"""
from __future__ import annotations

import subprocess
from datetime import datetime, timezone

from config import ARM_SOCIAL_SCRIPT, CTA_URL, PING_ENABLED, REPO, TEACHER_USER, log


def send_ping(title: str, pin: str, story: str, link: str = CTA_URL) -> bool:
    """title <=300 chars, pin <=1000, story <=500 (Worker limits)."""
    if not PING_ENABLED:
        log("ping: disabled (YT_CLIPPER_PING=0) — skipping")
        return False

    fire_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    cmd = [
        "node", str(ARM_SOCIAL_SCRIPT),
        "--fire", fire_iso,
        "--titles", title[:300],
        "--pin", pin[:1000],
        "--story", story[:500],
        "--link", link,
        "--user", TEACHER_USER,
    ]
    log(f"ping: firing (fire={fire_iso}) {title[:80]}")
    proc = subprocess.run(
        cmd, cwd=str(REPO), capture_output=True, text=True, encoding="utf-8",
    )
    if proc.returncode != 0:
        log(f"ping: FAILED ({proc.returncode}) {proc.stderr.strip()[:300]}")
        return False
    log("ping: armed OK")
    return True


def send_review_ping(summary: str, review_path) -> bool:
    return send_ping(
        summary,
        f"Review file: {review_path}",
        "Watch the YT/IG drafts, then reply APPROVE in Cursor to schedule (nothing posts yet)",
    )
