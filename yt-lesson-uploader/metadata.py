"""Title topic + timestamps for a lesson (Claude), and the final title/description text.

Title style (JD's): "Faye 113 - ポケモンの話"  /  "Kaether Emily 108 - Magnets and Wood、～ほうがいい"
Description: "113/114", blank line, timestamps, blank line, the channel footer.
No API key -> topic/timestamps are left out and the video is flagged needs_topic (filled in later from Cursor).
"""
from __future__ import annotations

import json
import re
import urllib.request

import lesson_transcribe as lt
import settings
from settings import log

SYSTEM = """You write the YouTube title topic and timestamps for a 1-on-1 Japanese lesson recording.
The teacher (JD) teaches an English speaker. The transcript is automatic and has errors: be careful with
names, and when unsure of a word, describe it plainly instead of guessing.

Return STRICT JSON only:
{
  "topic": "<what was mainly learned or talked about, max 45 chars>",
  "chapters": [{"t": <start time in SECONDS from the start of the lesson, e.g. 12:05 is 725; an hour-long lesson has values up to ~3600>, "title": "<max 6 words>"}]
}

TOPIC STYLE (JD's own): short, concrete, mixes Japanese and English naturally. Examples:
  "ポケモンの話"   "Magnets and Wood、～ほうがいい"   "と vs たら"   "Talking about a trip to Kyoto"
Name the main grammar point / theme, not "Japanese lesson". No quotes, no emoji, no trailing period.

CHAPTERS (the timestamps list). The first MUST have t=0 (the opening greeting/small talk, e.g. "あいさつ").
Add a chapter for:
  - any topic that takes up about 10+ minutes of talking (e.g. 5+ minutes about being homesick -> "ホームシック")
  - anything clip-worthy or noteworthy even if short: a clear warning/trap ("don't say..."), an analogy,
    a wrong-then-right correction, a funny or memorable moment, a new grammar point being taught
Skip filler. Usually 8-20 chapters for an hour; at least 10 seconds apart.
Chapter titles are little labels, max ~6 words, like JD would write them: short Japanese when it fits
("あいさつ", "ホームシック", "～ほうがいい", "ポケモンの話"), plain English otherwise
("Roleplay: ordering food", "Warning: は vs が"). Keep taught Japanese in Japanese.
PRIVACY: no last names, health, money, workplace or other personal details in the topic or chapters.
Do not invent things that are not in the transcript."""


def _fmt_ts(sec: int) -> str:
    h, rem = divmod(max(0, int(sec)), 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _extract_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _prompt(transcript: dict, who_label: str) -> str:
    return (f"Lesson with: {who_label}\nLength: {int(transcript['duration'] // 60)} min\n\n"
            f"TRANSCRIPT:\n{lt.timed_text(transcript)}")


BAD = "\ufffd"      # the \u00ef\u00bf\u00bd box that shows when a character got broken


def ask_cursor(transcript: dict, who_label: str, _retry: int = 0) -> dict:
    """Claude through the Cursor SDK (counts against your Cursor plan, no separate Anthropic account).
    Uses the TypeScript SDK via cursor_ask.mjs (the Python SDK's bridge breaks on Windows).
    Needs CURSOR_API_KEY from https://cursor.com/dashboard/integrations"""
    import os
    import subprocess

    key = settings.CURSOR_API_KEY
    if not key:
        raise RuntimeError("no CURSOR_API_KEY")
    model = settings.CURSOR_MODEL or "claude-sonnet-5-5"
    prompt_file = settings.WORK / "_prompt.txt"
    settings.WORK.mkdir(exist_ok=True)
    prompt_file.write_text(SYSTEM + "\n\nReply with the JSON only. Do not use any tools or edit any files.\n\n"
                           + _prompt(transcript, who_label), encoding="utf-8")
    log(f"metadata: asking Claude via Cursor SDK (model {model})")
    proc = subprocess.run(["node", str(settings.HERE / "cursor_ask.mjs"), str(prompt_file), model],
                          capture_output=True, text=True, encoding="utf-8", timeout=900,
                          env={**os.environ, "CURSOR_API_KEY": key}, cwd=str(settings.HERE))
    if proc.returncode != 0:
        raise RuntimeError(f"Cursor SDK failed ({proc.returncode}): {proc.stderr.strip()[:300]}")
    if BAD in proc.stdout and _retry < 2:      # a garbled character came back: ask again instead of publishing it
        log("metadata: garbled character in the reply, asking again")
        return ask_cursor(transcript, who_label, _retry + 1)
    data = _extract_json(proc.stdout)
    if not data or not data.get("topic"):
        raise RuntimeError("Cursor SDK returned no usable JSON")
    return clean(data, transcript["duration"])


def ask(transcript: dict, who_label: str) -> dict:
    """Anthropic API key if set, else Cursor SDK key, else raise (-> plain upload, topic added later)."""
    if settings.ANTHROPIC_API_KEY:
        return ask_claude(transcript, who_label)
    if settings.CURSOR_API_KEY:
        return ask_cursor(transcript, who_label)
    raise RuntimeError("no ANTHROPIC_API_KEY or CURSOR_API_KEY")


def ask_claude(transcript: dict, who_label: str) -> dict:
    key = settings.ANTHROPIC_API_KEY
    if not key:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    prompt = _prompt(transcript, who_label)
    body = json.dumps({"model": settings.CLAUDE_MODEL, "max_tokens": 1500, "system": SYSTEM,
                       "messages": [{"role": "user", "content": prompt}]}).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST",
                                 headers={"content-type": "application/json", "x-api-key": key,
                                          "anthropic-version": "2023-06-01"})
    log(f"metadata: asking Claude ({settings.CLAUDE_MODEL})")
    with urllib.request.urlopen(req, timeout=180) as r:
        payload = json.loads(r.read().decode("utf-8"))
    text = "".join(p.get("text", "") for p in payload.get("content", []) if p.get("type") == "text")
    data = _extract_json(text)
    if not data or not data.get("topic"):
        raise RuntimeError("Claude returned no usable JSON")
    return clean(data, transcript["duration"])


def clean(data: dict, duration: float) -> dict:
    """Enforce YouTube's chapter rules (starts at 0:00, >=3, >=10s apart) and trim the topic."""
    topic = re.sub(r"\s+", " ", str(data.get("topic", "")).replace(BAD, "")).strip().strip('"').rstrip(".")
    raw = data.get("chapters", [])
    try:
        ts = [float(c["t"]) for c in raw]
    except (KeyError, TypeError, ValueError):
        ts = []
    if duration > 1800 and len(ts) >= 4 and max(ts) < 120:      # model gave minutes instead of seconds
        raw = [{**c, "t": int(float(c["t"]) * 60)} for c in raw]
    chapters, last = [], -999
    for c in sorted(raw, key=lambda c: c.get("t", 0)):
        try:
            t, title = int(c["t"]), str(c["title"]).replace(BAD, "").strip()
        except (KeyError, TypeError, ValueError):
            continue
        if not title or t < 0 or t > duration or t - last < 10:
            continue
        chapters.append({"t": t, "title": title[:60]})
        last = t
    if chapters and chapters[0]["t"] != 0:
        chapters[0]["t"] = 0
    if len(chapters) < 3:
        chapters = []          # YouTube ignores chapter lists shorter than 3 — don't show a broken list
    return {"topic": topic[:60], "chapters": chapters}


def build_title(label: str, n: int, topic: str | None) -> str:
    base = f"{label} {n}"
    return f"{base} - {topic}"[:100] if topic else base


def build_description(n: int, total: int, chapters: list[dict]) -> str:
    footer = settings.FOOTER_TXT.read_text(encoding="utf-8") if settings.FOOTER_TXT.is_file() else ""
    parts = [f"{n}/{total}"]
    if chapters:
        parts.append("\n".join(f"{_fmt_ts(c['t'])} {c['title']}" for c in chapters))
    desc = "\n\n".join(parts)
    sep = "\n\n" if chapters else "\n"
    return desc + (sep + footer if footer else "")
