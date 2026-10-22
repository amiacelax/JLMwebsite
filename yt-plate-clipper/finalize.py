"""Finish a Cursor-backend pick: after Claude writes candidates.json (non-provisional),
rebuild review.md, mark the lesson reviewed, and send the review ping.

  python finalize.py "work\\2026-10-05 12-37-14 CJ 4"
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import config
import review as review_mod
import store
from config import log


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    wd = Path(sys.argv[1])
    if not wd.is_absolute():
        wd = config.CLIPPER_DIR / wd
    data = json.loads((wd / "candidates.json").read_text(encoding="utf-8"))
    data["provisional"] = False
    (wd / "candidates.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    name = data.get("source") or wd.name

    # Render the finished YT + IG drafts for every picked clip (keyed on the autumn
    # background, captions, end card). A plate without greenscreen can't be keyed.
    try:
        import compose
        n = compose.draft_lesson(wd)
        log(f"finalize: {n} clip(s) drafted")
        data = json.loads((wd / "candidates.json").read_text(encoding="utf-8"))
    except Exception as e:
        log(f"finalize: drafts NOT made — {e}")
        data["notes"] = (data.get("notes", "") + f" DRAFTS NOT MADE: {e}").strip()

    review_path = review_mod.write_review_md(data, wd, name)
    flag = wd / "NEEDS_CURSOR_PICK.flag"
    if flag.exists():
        flag.unlink()

    state = store.load_processed()
    for rec in state.values():
        if rec.get("work_dir") and Path(rec["work_dir"]) == wd:
            rec.update({"status": "reviewed", "candidates": len(data.get("clips", [])),
                        "review": str(review_path)})
    store.save_processed(state)

    import ping
    ping.send_review_ping(review_mod.ping_summary(data, name), review_path)
    log(f"finalize: {name} reviewed — {review_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
