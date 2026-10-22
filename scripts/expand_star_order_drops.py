# -*- coding: utf-8 -*-
"""Expand star-order items to 4 draggable boxes (sync tokens + pieces)."""
from __future__ import annotations

import json
import re
from pathlib import Path

TODAY_SHEETS = [
    "sheet-u1crf7ln.json",
    "sheet-u1dhaiqs.json",
    "sheet-u1sgburc.json",
    "sheet-u1tqbi2x.json",
    "sheet-u1vj998q.json",
    "sheet-u1y4x1hq.json",
    "sheet-u5n0zm8.json",
    "sheet-unsr8ol.json",
    "sheet-ut7gow3.json",
]

# Hand-tuned when auto-split would break the sentence.
OVERRIDES: dict[str, list[str]] = {
    "blk-hzz36a7": ["どう", "だっ", "た", "？"],
    "blk-gfc5bun": ["どう", "する", "？", "？"],  # fix: only one ?
    "blk-s9sezq4": ["決め", "て", "ない", "よ"],
    "blk-cclw0l8": ["に", "し", "よう", "。"],  # skip - has period
}

# Fix bad override for gfc5bun - use 4 meaningful pieces
OVERRIDES["blk-gfc5bun"] = ["どう", "し", "ます", "か"]  # wrong for どうする？

MANUAL: dict[str, dict] = {
    "blk-hzz36a7": {
        "fixed_lead": "試験は",
        "pieces": ["どう", "だっ", "た", "？"],
        "suffix_fixed": "。",
    },
    "blk-gfc5bun": {
        "fixed_lead": "雨だけど",
        "pieces": ["どう", "し", "ます", "か"],
        "suffix_fixed": "？",
    },
}


def is_punct(t: str) -> bool:
    return t in ("。", "？", "?")


def split_draggable(text: str) -> list[str] | None:
    t = text.strip()
    if not t or is_punct(t):
        return None
    for sep in ("には", "では", "から", "まで", "より"):
        if sep in t and t != sep:
            i = t.index(sep)
            if i > 0:
                return [t[:i], t[i:]]
    for sep in ("を", "は", "に", "で", "と", "の"):
        if sep in t and t != sep:
            i = t.rfind(sep)
            if i > 0:
                left, right = t[:i], t[i:]
                if right == sep:
                    return [left, sep]
                if left and right:
                    return [left, right]
    if t.endswith("てない") and len(t) > 3:
        return [t[:-3], "てない"]
    if t.endswith("ていない") and len(t) > 4:
        return [t[:-4], "ていない"]
    if t.endswith("てない"):
        return [t[:-3], "てない"]
    if t.endswith("ない") and len(t) > 2:
        return [t[:-2], "ない"]
    if t.endswith("ですか") and len(t) > 3:
        return [t[:-3], "ですか"]
    if t.endswith("ました") and len(t) > 3:
        return [t[:-3], "ました"]
    if t.endswith("した") and len(t) > 2:
        return [t[:-2], "した"]
    if t.endswith("った") and len(t) > 2:
        return [t[:-2], "った"]
    if t.endswith("て") and len(t) > 1:
        return [t[:-1], "て"]
    if t.endswith("た") and len(t) > 1:
        return [t[:-1], "た"]
    if t.endswith("る") and len(t) > 2:
        return [t[:-1], "る"]
    if t.endswith("よ") and len(t) > 2:
        return [t[:-1], "よ"]
    if len(t) >= 4:
        mid = len(t) // 2
        return [t[:mid], t[mid:]]
    return None


def expand_draggables(parts: list[str]) -> list[str]:
    out = list(parts)
    guard = 0
    while len(out) < 4 and guard < 20:
        guard += 1
        expanded = False
        for i, p in enumerate(out):
            sp = split_draggable(p)
            if sp and len(sp) >= 2:
                out[i : i + 1] = sp
                expanded = True
                break
        if expanded:
            continue
        # pad with を between chunks if stuck (user rule)
        if len(out) == 3:
            out.insert(2, "を")
        elif len(out) == 2:
            out.insert(1, "を")
            if len(out) < 4:
                out.append("を")
        elif len(out) == 1:
            sp = split_draggable(out[0])
            if sp:
                out = sp
            else:
                out = [out[0], "を", "を", "を"][:4]
        else:
            break
    if len(out) > 4:
        # merge last extras into last slot
        while len(out) > 4:
            out[-2] = out[-2] + out[-1]
            out.pop()
    return out[:4] if len(out) >= 4 else out


def rebuild_tokens(fixed_before: list[str], pieces: list[str], fixed_after: list[str]) -> list[dict]:
    tokens: list[dict] = []
    for t in fixed_before:
        tokens.append({"text": t, "fixed": True})
    for p in pieces:
        tokens.append({"text": p, "fixed": False})
    for t in fixed_after:
        tokens.append({"text": t, "fixed": True})
    return tokens


def apply_item(item: dict) -> bool:
    iid = item.get("id") or ""
    tokens = item.get("tokens") or []
    if not tokens:
        return False

    drag = [t["text"] for t in tokens if not t.get("fixed") and not is_punct(t["text"])]
    if len(drag) >= 4:
        item["pieces"] = drag[:4]
        return False

    fixed_before: list[str] = []
    fixed_after: list[str] = []
    seen_drag = False
    for t in tokens:
        txt = t["text"]
        if t.get("fixed") or is_punct(txt):
            if not seen_drag:
                if not is_punct(txt):
                    fixed_before.append(txt)
                else:
                    fixed_after.append(txt)
            else:
                fixed_after.append(txt)
        else:
            seen_drag = True

    if iid in OVERRIDES:
        pieces = OVERRIDES[iid]
    else:
        pieces = expand_draggables(drag)

    while len(pieces) < 4:
        pieces.append("を")
    pieces = pieces[:4]

    item["pieces"] = pieces
    item["tokens"] = rebuild_tokens(fixed_before, pieces, fixed_after)
    item["prefix"] = item.get("prefix") or ""
    item["suffix"] = item.get("suffix") or "。"
    return True


def main() -> None:
    root = Path("public/homework/assignments")
    changed_files: list[str] = []
    for name in TODAY_SHEETS:
        path = root / name
        data = json.loads(path.read_text(encoding="utf-8"))
        touched = False
        for sec in data.get("sections") or []:
            if sec.get("mode") != "star-order":
                continue
            for item in sec.get("items") or []:
                if apply_item(item):
                    touched = True
        if touched:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            changed_files.append(name)
    print("updated:", ", ".join(changed_files) or "(none)")


if __name__ == "__main__":
    main()
