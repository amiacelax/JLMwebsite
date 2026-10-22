"""Find lessons whose title/description has a broken-character box and redo their topic + timestamps."""
import json, re
import backfill_topics as b, metadata, youtube_api as y
from lesson_transcribe import work_dir
from pathlib import Path
yt = y.get_service()
for v in b.listing(yt, 30):
    if metadata.BAD not in v["title"] and metadata.BAD not in v["desc"]:
        continue
    print("garbled:", ascii(v["title"]))
    tp = work_dir(Path(f"{v['id']}.m4a")) / "transcript.json"
    if not tp.is_file():
        print("  no transcript cached, skipping"); continue
    m = re.match(r"^(.*?) (\d+)(?: - .*)?$", v["title"])
    c = re.match(r"^(\d+)/(\d+)", v["desc"])
    label, n, total = m.group(1), int(m.group(2)), int(c.group(2))
    meta = metadata.ask(json.loads(tp.read_text(encoding="utf-8")), label)
    title = metadata.build_title(label, n, meta["topic"])
    y.update_video(yt, v["id"], title, metadata.build_description(n, total, meta["chapters"]))
    print("  fixed ->", title)
print("scan done")
