"""Claude clip-candidate detection + paste-ready copy (pluggable backend).

Backends (env YT_CLIPPER_CLAUDE_BACKEND):
  - "cursor" (default, $0 extra): write CLAUDE_PROMPT.md + NEEDS_CURSOR_PICK.flag and
    a provisional (regex) candidates.json. Claude-in-Cursor finalizes next time it's open.
  - "cli":  run `claude -p <prompt>` headless (needs Claude Code CLI + login).
  - "api":  POST to the Anthropic API (needs ANTHROPIC_API_KEY). Fully headless.

All backends converge on candidates.json with the same schema, so Phase 2 reads
one shape no matter how the pick was made. Claude only — no other models.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

from config import CLAUDE_BACKEND, CLAUDE_MODEL, CTA_URL, OFFER, log

# --- Prompt ------------------------------------------------------------------
SYSTEM_RULES = f"""You are the clip-picker for a Japanese-teacher's Shorts/Reels pipeline.
Follow these rules (from shorts-reel-post-workflow.mdc):

HUNT THREE TYPES, warnings FIRST, then wrong-then-right, then analogy:
1. warning  — teacher flags a trap: don't / doesn't mean / be careful / this is where you mess up.
   The save is the stop sign, not the definition.
2. wrong-then-right — he says the bad line, then the good one (or quiz beat -> fix). YT wants this first second.
3. analogy  — a map onto something else ("it's like", "think of it as", an English sentence held up beside the Japanese).
Plain meanings (what a word means / grammar labels) are leftover — only use them if there's no warning/analogy/wrong-right, and say so.

PLATFORM DIFFERENCES:
- Instagram Reels: lead with a warning or a landed analogy. Saves + follows.
- YouTube Shorts: lead concrete mistake -> quiz -> fix. First second must be a sharp problem.

COPY RULES:
- Offer wording is exactly: "{OFFER}" (not "free consultation").
- CTA / link is always: {CTA_URL}
- YouTube: punchy Title + Description (light hashtags + the CTA URL).
- Instagram: Caption with CTA = link in bio, hashtags at end, final line "Book a trial lesson -> link in bio".
- Keep mistake->fix pedagogy in captions; do not "correct" intentional student-mistake captions.

Return STRICT JSON only (no prose), shape:
{{
  "clips": [
    {{
      "rank": 1,
      "tag": "warning" | "wrong-then-right" | "analogy" | "meaning",
      "start": <seconds float>,
      "end": <seconds float>,
      "hook_reason": "<why this grabs in the first second>",
      "best_platform": "yt" | "ig" | "both",
      "spoken_summary": "<the key line(s), lightly cleaned>",
      "topper_en": "<on-screen black pill, <=2 short lines separated by \\n, e.g. \\"Don't directly\\ntranslate!\\". No , . ; : punctuation>",
      "topper_jp": "<on-screen orange pill: the Japanese word/phrase in question, e.g. いつ — or empty>",
      "marks": [  // the spoken Japanese that is WRONG or RIGHT inside this clip (drives red/green captions + buzzer/ding)
        {{"start": <abs seconds>, "end": <abs seconds>, "verdict": "wrong" | "right"}}
      ],
      "yt_title": "<hooky, identifies the clip>",
      "yt_description": "<1-3 lines + light hashtags + {CTA_URL}>",
      "ig_caption": "<hook + value + hashtags at end + 'Book a trial lesson -> link in bio'>"
    }}
  ],
  "notes": "<optional: if only meanings were available, say so>"
}}
marks: cover only the Japanese words themselves (the bad line = wrong, the fixed line = right). Leave [] if the clip has no wrong/right Japanese — auto-detection from phrases like "can't say" fills in when you omit it.
Order clips warnings first. Aim for 3-6 strong candidates. Keep each clip 12-45s."""


def build_prompt(result: dict, prefilter: list[dict], source_name: str) -> str:
    """Full user prompt: transcript (timecoded) + regex shortlist."""
    seg_lines = [
        f"[{s['start']:.1f}-{s['end']:.1f}] {s['text']}" for s in result.get("segments", [])
    ]
    transcript = "\n".join(seg_lines)
    pf_lines = [
        f"- ({c['tag']}) {c['start']:.1f}-{c['end']:.1f}: {c['hint_segment']}"
        for c in prefilter
    ]
    pf_block = "\n".join(pf_lines) if pf_lines else "(none found by regex — scan the full transcript)"
    return (
        f"SOURCE: {source_name}\n"
        f"DURATION: {result.get('duration')}s   LANGUAGE: {result.get('language')}\n\n"
        f"REGEX SHORTLIST (hints only — you decide the real cuts):\n{pf_block}\n\n"
        f"FULL TIMECODED TRANSCRIPT:\n{transcript}\n\n"
        f"Pick the best clips per the rules and return STRICT JSON."
    )


# --- JSON extraction ---------------------------------------------------------
def _extract_json(text: str) -> dict | None:
    """Pull the first {...} JSON object out of a model response."""
    text = text.strip()
    # Strip ```json fences if present.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


# --- Backends ----------------------------------------------------------------
def _provisional_from_prefilter(prefilter: list[dict], source_name: str) -> dict:
    """Regex-only placeholder so the review file/ping work before Claude finalizes."""
    clips = []
    for i, c in enumerate(prefilter[:6], start=1):
        clips.append({
            "rank": i,
            "tag": c["tag"],
            "start": c["start"],
            "end": c["end"],
            "hook_reason": "(provisional — regex match; awaiting Claude pick)",
            "best_platform": "both",
            "spoken_summary": c["hint_segment"],
            "yt_title": "",
            "yt_description": "",
            "ig_caption": "",
        })
    return {
        "clips": clips,
        "notes": "PROVISIONAL regex shortlist. Open Cursor so Claude can finalize the pick + copy.",
        "provisional": True,
    }


def _run_cursor_backend(prompt: str, prefilter: list[dict], work_dir: Path, source_name: str) -> dict:
    (work_dir / "CLAUDE_PROMPT.md").write_text(
        SYSTEM_RULES + "\n\n---\n\n" + prompt, encoding="utf-8"
    )
    (work_dir / "NEEDS_CURSOR_PICK.flag").write_text(
        "Open Cursor and ask Claude to read CLAUDE_PROMPT.md, then write candidates.json "
        "(same schema) and review.md.\n",
        encoding="utf-8",
    )
    log("claude_pick: backend=cursor — wrote CLAUDE_PROMPT.md + flag; provisional candidates for now")
    return _provisional_from_prefilter(prefilter, source_name)


def _run_cli_backend(prompt: str) -> dict:
    full = SYSTEM_RULES + "\n\n" + prompt
    log("claude_pick: backend=cli — invoking `claude -p`")
    proc = subprocess.run(
        ["claude", "-p", full], capture_output=True, text=True, encoding="utf-8",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude CLI failed ({proc.returncode}): {proc.stderr[:300]}")
    data = _extract_json(proc.stdout)
    if not data:
        raise RuntimeError("claude CLI returned no parseable JSON")
    return data


def _run_api_backend(prompt: str) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set (needed for api backend)")
    log(f"claude_pick: backend=api — calling Anthropic ({CLAUDE_MODEL})")
    body = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": 4096,
        "system": SYSTEM_RULES,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    parts = payload.get("content") or []
    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
    data = _extract_json(text)
    if not data:
        raise RuntimeError("Anthropic API returned no parseable JSON")
    return data


def pick(result: dict, prefilter: list[dict], work_dir: Path, source_name: str) -> dict:
    """Dispatch to the configured backend; always writes candidates.json."""
    prompt = build_prompt(result, prefilter, source_name)
    work_dir.mkdir(parents=True, exist_ok=True)

    if CLAUDE_BACKEND == "cursor":
        data = _run_cursor_backend(prompt, prefilter, work_dir, source_name)
    elif CLAUDE_BACKEND == "cli":
        data = _run_cli_backend(prompt)
    elif CLAUDE_BACKEND == "api":
        data = _run_api_backend(prompt)
    else:
        raise RuntimeError(f"Unknown YT_CLIPPER_CLAUDE_BACKEND: {CLAUDE_BACKEND!r}")

    data.setdefault("source", source_name)
    (work_dir / "candidates.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    clips = data.get("clips", [])
    log(f"claude_pick: {len(clips)} candidate(s) (provisional={data.get('provisional', False)})")
    return data
