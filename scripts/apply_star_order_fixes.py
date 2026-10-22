# -*- coding: utf-8 -*-
"""Apply hand-tuned 4-box star-order fixes (today's Core JP sheets)."""
from __future__ import annotations

import json
from pathlib import Path

# id -> (fixed_before list, pieces[4], fixed_after list)
FIXES: dict[str, tuple[list[str], list[str], list[str]]] = {
    # どう？
    "blk-hzz36a7": (["試験は"], ["どう", "だっ", "た", "？"], ["。"]),
    "blk-t1ksjb1": (["この映画"], ["どう", "思", "う", "？"], ["。"]),
    "blk-gfc5bun": (["雨だけど"], ["どう", "す", "る", "？"], ["。"]),
    # 以…
    "blk-yb4of20": (["6月"], ["以降", "は", "暑", "い"], ["。"]),
    "blk-xrafw11": (["明日"], ["以外", "は", "行け", "ます"], ["。"]),
    "blk-3rfkzhj": (["5分"], ["以内", "に", "来", "て"], ["。"]),
    # もう・まだ
    "blk-44k4m0o": (["もう"], ["朝ごはん", "を", "食べ", "た"], ["。"]),
    "blk-e5yw3ba": (["もう"], ["その店", "に", "は", "行かない"], ["。"]),
    "blk-sgoicfi": (["もう"], ["やら", "ない", "から", "大丈夫"], ["。"]),
    "blk-7fw63w5": (["もう"], ["ゲーム", "は", "して", "ない"], ["。"]),
    "blk-ggerg9b": (["もう"], ["日本", "に", "は", "住んでない"], ["。"]),
    "blk-7his243": (["もう"], ["いい", "よ", "帰っ", "て"], ["。"]),
    "blk-262ssgg": (["宿題は"], ["もう", "終わ", "っ", "た"], ["。"]),
    "blk-4hddie0": (["まだ"], ["生き", "て", "る", "？"], []),
    "blk-f6n9qtk": (["まだ"], ["朝ごはん", "を", "食べ", "てない"], ["。"]),
    "blk-yor28ke": (["宿題は"], ["まだ", "終わ", "って", "ない"], ["。"]),
    "blk-3hxu701": (["彼は"], ["まだ", "来", "て", "ない"], ["。"]),
    "blk-fdpooiu": (["まだ"], ["学生", "で", "す", "よ"], ["。"]),
    "blk-wutbvj3": (["映画は"], ["まだ", "見", "て", "ない"], ["。"]),
    "blk-s9sezq4": (["まだ"], ["決め", "て", "ない", "よ"], ["。"]),
    # だれ
    "blk-4xtclek": (["あの人は"], ["だれ", "で", "す", "か"], ["。"]),
    "blk-evkik72": (["これは"], ["だれ", "の", "カバン", "ですか"], ["。"]),
    "blk-age4zfr": (["昨日"], ["だれ", "と", "会っ", "た"], ["の", "。"]),
    # ～にする
    "blk-m6wrtjt": (["飲み物は"], ["コーヒー", "に", "す", "る"], ["。"]),
    "blk-bs3dgem": (["今日の晩ごはんは"], ["カレー", "に", "し", "た"], ["。"]),
    "blk-cclw0l8": (["これ"], ["に", "し", "よ", "う"], ["。"]),
    # なんで・どうして
    "blk-h2ouzxz": (["なんで"], ["遅れ", "た", "ん", "？"], ["。"]),
    "blk-6ezv4ii": (["どうして"], ["日本", "に", "来", "た"], ["んですか", "。"]),
    "blk-d0ljdbf": (["疲れたから"], ["今日", "は", "帰り", "ます"], ["。"]),
    # なに・なん
    "blk-c2y1dxb": (["それは"], ["何", "で", "す", "か"], ["。"]),
    "blk-k6notqn": (["今"], ["何", "を", "して", "る"], ["の", "。"]),
    "blk-t3gy4tg": (["誕生日は"], ["何月", "何日", "です", "か"], ["。"]),
    # どこ
    "blk-7c688kk": (["トイレは"], ["どこ", "で", "す", "か"], ["。"]),
    "blk-0vs9pnj": (["週末は"], ["どこ", "に", "行く", "の"], ["。"]),
    "blk-26cvsa6": (["どこで"], ["日本語", "を", "勉強", "してる"], ["。"]),
    # いつ・何時
    "blk-m2bp8j6": (["日本に"], ["いつ", "来", "まし", "たか"], ["。"]),
    "blk-7lm6bsu": (["明日は"], ["何時", "に", "会", "う"], ["。"]),
    "blk-gatzcy9": (["何年"], ["前", "に", "始め", "た"], ["。"]),
}

FILES = [
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


def apply_item(item: dict) -> bool:
    iid = item.get("id") or ""
    if iid not in FIXES:
        return False
    fixed_before, pieces, fixed_after = FIXES[iid]
    if len(pieces) != 4:
        raise ValueError(iid)
    tokens: list[dict] = []
    for t in fixed_before:
        tokens.append({"text": t, "fixed": True})
    for p in pieces:
        tokens.append({"text": p, "fixed": False})
    for t in fixed_after:
        tokens.append({"text": t, "fixed": True})
    item["tokens"] = tokens
    item["pieces"] = list(pieces)
    item["prefix"] = item.get("prefix") or ""
    item["suffix"] = item.get("suffix") or "。"
    return True


def main() -> None:
    root = Path("public/homework/assignments")
    for name in FILES:
        path = root / name
        data = json.loads(path.read_text(encoding="utf-8"))
        for sec in data.get("sections") or []:
            if sec.get("mode") != "star-order":
                continue
            for item in sec.get("items") or []:
                apply_item(item)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("applied", len(FIXES), "fixes")


if __name__ == "__main__":
    main()
