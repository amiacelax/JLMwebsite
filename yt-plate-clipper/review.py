"""Render candidates.json -> human review.md, and build the ping summary.

The review.md is what JD reads at the gate. The ping (Discord/Hub) is just the
nudge pointing at it. Nothing is cut or posted here — Phase 1 ends at review.
"""
from __future__ import annotations

from pathlib import Path

from config import CTA_URL, OFFER


def _fmt_ts(sec: float) -> str:
    sec = max(0.0, float(sec))
    m = int(sec // 60)
    s = int(sec % 60)
    return f"{m:d}:{s:02d}"


def write_review_md(data: dict, work_dir: Path, source_name: str) -> Path:
    clips = data.get("clips", [])
    provisional = bool(data.get("provisional"))
    lines: list[str] = []
    lines.append(f"# Review — {source_name}")
    lines.append("")
    if provisional:
        lines.append("> **PROVISIONAL (regex shortlist).** Open Cursor so Claude finalizes "
                     "the pick + copy, then this file is rewritten.")
        lines.append("")
    if data.get("notes"):
        lines.append(f"_Notes: {data['notes']}_")
        lines.append("")
    lines.append(f"**{len(clips)} candidate(s)** — warnings first. "
                 f"Offer: {OFFER}. CTA: {CTA_URL}")
    lines.append("")

    for c in clips:
        rank = c.get("rank", "?")
        tag = c.get("tag", "?")
        start = c.get("start", 0)
        end = c.get("end", 0)
        plat = c.get("best_platform", "both")
        lines.append(f"## {rank}. [{tag}] {_fmt_ts(start)}–{_fmt_ts(end)}  "
                     f"({start:.1f}s–{end:.1f}s)  · best: {plat}")
        if c.get("hook_reason"):
            lines.append(f"- **Hook:** {c['hook_reason']}")
        if c.get("spoken_summary"):
            lines.append(f"- **Line:** {c['spoken_summary']}")
        if c.get("topper_en") or c.get("topper_jp"):
            lines.append(f"- **Topper:** {(c.get('topper_en') or '').replace(chr(10), ' / ')} | {c.get('topper_jp') or ''}")
        if c.get("drafts"):
            lines.append(f"- **YT draft:** `{c['drafts'].get('yt')}`")
            lines.append(f"- **IG draft:** `{c['drafts'].get('ig')}`")
        if c.get("yt_title"):
            lines.append("")
            lines.append("**YT Title**")
            lines.append("```")
            lines.append(c["yt_title"])
            lines.append("```")
        if c.get("yt_description"):
            lines.append("**YT Description**")
            lines.append("```")
            lines.append(c["yt_description"])
            lines.append("```")
        if c.get("ig_caption"):
            lines.append("**IG Caption**")
            lines.append("```")
            lines.append(c["ig_caption"])
            lines.append("```")
        lines.append("")

    path = work_dir / "review.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def ping_summary(data: dict, source_name: str) -> str:
    """<=300 char title line for the social-reminders ping."""
    clips = data.get("clips", [])
    by_tag: dict[str, int] = {}
    for c in clips:
        by_tag[c.get("tag", "?")] = by_tag.get(c.get("tag", "?"), 0) + 1
    tag_bits = ", ".join(f"{n} {t}" for t, n in by_tag.items())
    prefix = "PROVISIONAL " if data.get("provisional") else ""
    s = f"{prefix}YT Plate Clipper — {source_name}: {len(clips)} candidates ({tag_bits}). Review on PC."
    return s[:300]
