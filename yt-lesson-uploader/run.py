"""YT Lesson Uploader â€” watches the OBS 'YouTube Straight' folder and uploads each finished lesson
to YouTube as UNLISTED, titled/numbered/timestamped, and added to the student's playlist.

  python run.py once                 one pass (daytime 3:45 PM task; waits on calendar)
  python run.py once --no-wait       night pass: upload as soon as the file is stable
  python run.py status               what's uploaded / waiting / needs an answer
  python run.py assign "<file>" faye [Emily] [--n 113]   tell me who a held lesson was
  python run.py set-total faye 118   new payment -> new total for a student
  python run.py invoice faye         draft a PayPal invoice now + post it (with copy/paste msg) to Other Notifications
  python run.py finish "<file>"      apply work/<lesson>/meta.json (topic + chapters) to the video
  python run.py ignore "<file>"      never upload this file
  python run.py safe-to-delete       files fully verified on YouTube

Nothing here deletes lesson videos, plates, or Whisper files. Clip farming uses the
lesson recordings; the Clips agent cleans those up after.
"""
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import invoices
import lesson_transcribe as lt
import metadata
import settings
import students
from settings import log

PLATE_CLIPPER = settings.CLIPPER_DIR


# ------------------------------------------------------------------ state
def load_state() -> dict:
    if settings.STATE_JSON.is_file():
        return json.loads(settings.STATE_JSON.read_text(encoding="utf-8"))
    return {}


def save_state(state: dict) -> None:
    settings.STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = settings.STATE_JSON.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(settings.STATE_JSON)


REPO = Path(__file__).resolve().parent.parent
ARM_SOCIAL = REPO / "scripts" / "arm-social-reminder.mjs"


# ------------------------------------------------------------------ pings
def ping(title: str, detail: str = "") -> None:
    """One plain Discord + Teacher Hub message (no copy blocks, no links, no contact URL)."""
    if not settings.PING_ENABLED:
        return
    text = (title + ("\n" + detail if detail else "")).strip()[:1000]
    fire = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    try:
        proc = subprocess.run(
            ["node", str(ARM_SOCIAL), "--fire", fire, "--titles", text[:290], "--pin", text, "--plain", "--user", "jlm"],
            cwd=str(REPO), capture_output=True, text=True, encoding="utf-8", timeout=60)
        if proc.returncode != 0:
            log(f"ping failed: {proc.stderr.strip()[:200]}")
    except Exception as e:  # a ping failure must never lose work
        log(f"ping failed: {e!r}")


def ping_student_uploaded(student: dict, title: str, video_id: str) -> None:
    """DM the student: JD uploaded your lesson to YouTube. No hub username = skip."""
    hub = str(student.get("hub") or "").strip()
    if not hub or settings.SANDBOX:
        if not hub:
            log(f"no hub username for {student.get('key')} — student not pinged")
        return
    try:
        proc = subprocess.run(
            ["node", str(REPO / "scripts" / "ping-lesson-uploaded.mjs"),
             "--user", hub, "--title", title or "", "--video", video_id or ""],
            cwd=str(REPO), capture_output=True, text=True, encoding="utf-8", timeout=60)
        if proc.returncode != 0:
            log(f"student ping failed: {(proc.stderr or proc.stdout or '').strip()[:200]}")
        else:
            log(f"student ping: {(proc.stdout or '').strip()[:200]}")
    except Exception as e:
        log(f"student ping failed: {e!r}")


HW_CUES = (
    "i'm gonna make that",
    "im gonna make that",
    "i'm going to make that",
    "gonna make that for you",
    "make homework for",
    "make that homework",
    "i'll make that homework",
)


def note_homework_cue(rec: dict, transcript: dict, label: str) -> None:
    """JD said he'll make homework. Ping him with the bit of transcript, once."""
    if rec.get("hw_cue_pinged") or settings.SANDBOX:
        return
    text = lt.full_text(transcript)
    low = text.lower()
    hit = next((c for c in HW_CUES if c in low), None)
    if not hit:
        return
    i = low.find(hit)
    snippet = " ".join(text[max(0, i - 90): i + 320].split())
    rec["hw_cue_pinged"] = True
    save_state_hook()
    ping(f"Homework cue — {label}", snippet)


def still_waiting(state: dict, sdata: dict, exclude: str) -> list[str]:
    """Other lessons in the folder that haven't uploaded yet, e.g. 'CJ 5 - still uploading'."""
    out = []
    for p in sorted(settings.WATCH_DIR.glob("*.mp4")):
        if p.name == exclude or state.get(p.name, {}).get("status") in (
                "uploaded", "verified", "ignored", "skipped-short", "error-final"):
            continue
        try:
            st, _n = students.from_filename(sdata, p)
            if st is None:
                when = students.start_time(p)
                st = students.from_schedule(sdata, when)[0] if when else None
            if st is None:
                continue
            n = students.next_numbers(st, None)[0]
            out.append(f"{st['display']} {n} - " + ("still uploading" if is_stable(p) else "still recording"))
        except Exception:
            continue
    return out


def hold(rec: dict, status: str, reason: str, name: str) -> None:
    """Park a lesson that needs JD's answer; ping once per reason."""
    rec["status"] = status
    rec["reason"] = reason
    if rec.get("pinged") != reason:
        ping(f"Lesson upload on hold: {name}", f"{reason}\nFile: {name}\nTell Cursor who it was "
                                              f"(e.g. 'assign it to Faye') and it uploads on the next run.")
        rec["pinged"] = reason
    log(f"HOLD {name}: {reason}")


# ------------------------------------------------------------------ helpers
def is_stable(path: Path) -> bool:
    try:
        st = path.stat()
    except OSError:
        return False
    age = time.time() - st.st_mtime
    return age > settings.STABLE_MINUTES * 60


def find_file(token: str) -> Path | None:
    token = token.lower()
    for p in settings.WATCH_DIR.glob("*.mp4"):
        if token in p.name.lower():
            return p
    return None


def _unique_name(state: dict, token: str) -> str | None:
    hits = [n for n in state if token.lower() in n.lower()]
    return hits[0] if len(hits) == 1 else (token if token in state else None)


# ------------------------------------------------------------------ processing
def process(path: Path, rec: dict, sdata: dict, yt) -> None:
    import youtube_api as y

    name = path.name
    dur = lt.probe_duration(path)
    rec["duration"] = round(dur, 1)

    # 1) who is it?  manual (assign / filename) > usual slot
    student = None
    explicit_n = rec.get("n")
    note = ""
    if rec.get("student"):
        student = students.by_key(sdata, rec["student"])
    if student is None:
        student, fn_n = students.from_filename(sdata, path)
        if student:
            explicit_n = explicit_n or fn_n
            note = "name in the file name"
    if student is None:
        when = students.start_time(path)
        if when is None:
            hold(rec, "needs-student", "file name has no start time and no student name", name)
            return
        student, note = students.from_schedule(sdata, when)
        if student is None:
            hold(rec, "needs-student", f"{note}. Who was this lesson with?", name)
            return
    rec["student"] = student["key"]
    rec["id_note"] = note

    # 2) transcript (also decides Emily/Jer, Regina/Michael)
    transcript = lt.transcribe(path)
    who = rec.get("who")
    if student.get("who") and not who:
        for w in student["who"]:
            if w["name"].lower() in path.stem.lower():
                who = w["name"]
        if not who:
            who, counts = students.pick_who(student, lt.full_text(transcript))
            rec["who_counts"] = counts
        if not who:
            names = " or ".join(w["name"] for w in student["who"])
            hold(rec, "needs-who", f"{student['display']}: could not tell if it was {names} "
                                   f"(name mentions: {rec.get('who_counts')})", name)
            return
    rec["who"] = who

    # 3) numbers
    n, total = students.next_numbers(student, explicit_n)   # past the total is fine: 115/114 shows who's owed an invoice
    rec["n"], rec["total"] = n, total
    label = students.label(student, who)

    # 4) topic + timestamps (Claude). No API key -> upload plain and flag it.
    topic, chapters, needs_topic = None, [], True
    mp = metadata_path(path)
    if mp.is_file():                                  # written by Cursor/Claude (finish flow)
        m = json.loads(mp.read_text(encoding="utf-8-sig"))
        topic, chapters, needs_topic = m.get("topic"), m.get("chapters", []), False
    else:
        try:
            m = metadata.ask(transcript, label)
            topic, chapters, needs_topic = m["topic"], m["chapters"], False
            mp.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
        except Exception as e:
            log(f"metadata: no topic ({e}) - uploading with the plain title, flagged needs_topic")
    title = metadata.build_title(label, n, topic)
    if settings.SANDBOX:
        title = "TEST " + title
    desc = metadata.build_description(n, total, chapters)
    rec.update(title=title, needs_topic=needs_topic)

    # 5) upload (never twice: adopt an identical recent upload if a previous run died mid-way)
    vid = rec.get("video_id")
    if not vid and rec.get("status") == "uploading":
        for u in y.recent_uploads(yt):
            if u["title"].strip() == title and u["published"] > (datetime.utcnow() - timedelta(days=2)).isoformat():
                vid = u["id"]
                log(f"adopting existing upload {vid} for {name}")
                break
    if not vid:
        rec["status"] = "uploading"
        save_state_hook()
        log(f"UPLOADING {name} -> '{title}' ({settings.PRIVACY})")
        vid = y.upload(yt, path, title, desc, settings.PRIVACY, progress=log)
    rec["video_id"] = vid
    rec["status"] = "uploaded"
    rec["uploaded_at"] = datetime.now().isoformat(timespec="seconds")
    save_state_hook()

    # 6) playlist + counter
    try:
        pid = None if settings.SANDBOX else (student.get("playlist_id") or y.find_playlist(yt, student["playlist"]))
        if pid and not y.in_playlist(yt, pid, vid):
            y.add_to_playlist(yt, pid, vid)
        rec["playlist_ok"] = bool(pid)
    except Exception as e:
        log(f"playlist add failed (verify pass will retry): {e!r}")
    students.commit(sdata, student["key"], n, total)
    students.save(sdata)

    # 7) tell JD: one plain message (no links)
    line = f"- {title} ({n}/{total}, unlisted)" + (" - topic + timestamps still to add" if needs_topic else "")
    lines = ["Uploaded:", line]
    waiting = still_waiting(_STATE, sdata, name)
    if waiting:
        lines += ["", "Still working:"] + [f"- {w}" for w in waiting]
    if n >= total and not student.get("same_as_number"):
        over = "" if n == total else f" (already {n - total} over)"
        posted = invoices.handle(student, n)
        lines += ["", f"{student['display']} is at {n}/{total}{over} - "
                  + ("invoice draft posted in Other Notifications" if posted else "needs a new invoice?")]
    ping("\n".join(lines))
    ping_student_uploaded(student, title, vid)
    note_homework_cue(rec, transcript, label)
    log(f"DONE {name}: https://youtu.be/{vid}")


_STATE = {}


def save_state_hook() -> None:
    save_state(_STATE)


def metadata_path(path: Path) -> Path:
    return lt.work_dir(path) / "meta.json"


def verify(state: dict, sdata: dict, yt) -> None:
    """Confirm uploaded videos finished processing, are unlisted, right length, and in the playlist."""
    import youtube_api as y
    for name, rec in state.items():
        if rec.get("status") != "uploaded" or not rec.get("video_id"):
            continue
        try:
            v = y.video_info(yt, rec["video_id"])
            if not v:
                rec["verify_note"] = "video not found on YouTube"
                continue
            proc = v.get("processingDetails", {}).get("processingStatus")
            up = v["status"].get("uploadStatus")
            if up in ("failed", "rejected"):
                rec["status"] = "error"
                rec["reason"] = f"YouTube says {up}: {v['status'].get('failureReason') or v['status'].get('rejectionReason')}"
                ping(f"Upload problem: {name}", rec["reason"])
                continue
            if proc != "succeeded" and up != "processed":
                rec["verify_note"] = f"still processing ({proc})"
                continue
            yt_len = y.iso_seconds(v["contentDetails"]["duration"])
            ok_len = abs(yt_len - rec.get("duration", 0)) <= 5
            ok_priv = v["status"]["privacyStatus"] == settings.PRIVACY
            student = students.by_key(sdata, rec["student"])
            pid = None if settings.SANDBOX else (student.get("playlist_id") if student else None)
            if pid and not y.in_playlist(yt, pid, rec["video_id"]):
                y.add_to_playlist(yt, pid, rec["video_id"])
            ok_pl = (not pid) or y.in_playlist(yt, pid, rec["video_id"])
            if ok_len and ok_priv and ok_pl:
                rec["status"] = "verified"
                rec["verified_at"] = datetime.now().isoformat(timespec="seconds")
                rec.pop("verify_note", None)
                log(f"VERIFIED {name} (length {yt_len:.0f}s, {settings.PRIVACY}, in playlist)")
            else:
                rec["verify_note"] = f"length_ok={ok_len} unlisted={ok_priv} in_playlist={ok_pl}"
                log(f"verify {name}: {rec['verify_note']}")
        except Exception as e:
            rec["verify_note"] = f"verify error: {e!r}"
            log(rec["verify_note"])


# ------------------------------------------------------------------ commands
def cmd_once() -> int:
    global _STATE
    guard = socket.socket()
    try:
        guard.bind(("127.0.0.1", settings.LOCK_PORT))
    except OSError:
        log("another uploader run is active - exiting")
        return 0
    settings.WORK.mkdir(exist_ok=True)
    state = _STATE = load_state()
    if not settings.WATCH_DIR.is_dir():
        log(f"watch folder missing: {settings.WATCH_DIR}")
        return 1
    sdata = students.load()

    todo = []
    for p in sorted(settings.WATCH_DIR.glob("*.mp4")):
        rec = state.setdefault(p.name, {"status": "new"})
        if rec["status"] in ("uploaded", "verified", "ignored", "skipped-short", "error-final"):
            continue
        if not is_stable(p):
            continue
        if rec["status"] == "new" and lt.probe_duration(p) < settings.MIN_LESSON_SECONDS:
            rec["status"] = "skipped-short"
            log(f"skip (shorter than {settings.MIN_LESSON_SECONDS // 60} min, not a lesson): {p.name}")
            continue
        todo.append((p, rec))
    save_state(state)

    import youtube_api as y
    yt = y.get_service() if (todo or any(r.get("status") == "uploaded" for r in state.values())) else None
    for p, rec in todo:
        try:
            process(p, rec, sdata, yt)
        except Exception as e:
            import traceback
            log(f"ERROR {p.name}: {e!r}\n{traceback.format_exc()}")
            rec["error"] = repr(e)
            rec["errors"] = rec.get("errors", 0) + 1
            if rec["errors"] >= 3 and rec.get("status") != "uploaded":
                rec["status"] = "error-final"
                ping(f"Lesson upload FAILED 3x: {p.name}", repr(e))
        save_state(state)
    if yt:
        verify(state, sdata, yt)
        save_state(state)
    return 0


def cmd_status() -> int:
    state = load_state()
    sdata = students.load()
    for name, rec in sorted(state.items()):
        extra = rec.get("reason") or rec.get("verify_note") or ""
        print(f"{rec.get('status', '?'):14} {rec.get('title', '-'):38} {name}  {extra}")
    print("\nNext numbers:")
    for s in sdata["students"]:
        n, t = students.next_numbers(s)
        print(f"  {s['display']:9} next = {n}/{t}")
    return 0


def cmd_assign(args) -> int:
    state = load_state()
    sdata = students.load()
    name = _unique_name(state, args.file)
    if not name:
        hit = find_file(args.file)
        if hit:
            name = hit.name
            state.setdefault(name, {"status": "new"})
        else:
            print("No unique match for", args.file)
            return 1
    st = students.by_key(sdata, args.student)
    if not st:
        print("Unknown student", args.student)
        return 1
    rec = state[name]
    rec.update(student=st["key"], status="new")
    rec.pop("pinged", None)
    rec.pop("reason", None)
    if args.who:
        rec["who"] = args.who
    if args.n is not None:
        rec["n"] = args.n
    save_state(state)
    print(f"{name} -> {st['display']} {args.who or ''} (uploads on the next run)")
    return 0


def cmd_set_total(args) -> int:
    sdata = students.load()
    st = students.by_key(sdata, args.student)
    if not st:
        print("Unknown student")
        return 1
    st["total"] = args.total
    students.save(sdata)
    state = load_state()
    for rec in state.values():
        if rec.get("status") == "needs-total" and rec.get("student") == st["key"]:
            rec["status"] = "new"
            rec.pop("pinged", None)
    save_state(state)
    print(f"{st['display']} total is now {args.total}")
    return 0


def cmd_finish(args) -> int:
    import youtube_api as y
    state = load_state()
    name = _unique_name(state, args.file)
    if not name or not state[name].get("video_id"):
        print("No uploaded lesson matches", args.file)
        return 1
    rec = state[name]
    mp = metadata_path(Path(settings.WATCH_DIR / name))
    if not mp.is_file():
        print("Missing", mp, "- write {topic, chapters} there first")
        return 1
    m = metadata.clean(json.loads(mp.read_text(encoding="utf-8-sig")), rec.get("duration", 99999))
    sdata = students.load()
    st = students.by_key(sdata, rec["student"])
    label = students.label(st, rec.get("who"))
    title = metadata.build_title(label, rec["n"], m["topic"])
    desc = metadata.build_description(rec["n"], rec["total"], m["chapters"])
    y.update_video(y.get_service(), rec["video_id"], title, desc)
    rec.update(title=title, needs_topic=False)
    save_state(state)
    print("Updated:", title, f"({len(m['chapters'])} chapters)")
    return 0


def cmd_ignore(args) -> int:
    state = load_state()
    name = _unique_name(state, args.file)
    if not name:
        print("No unique match")
        return 1
    state[name]["status"] = "ignored"
    save_state(state)
    print("ignored", name)
    return 0


def cmd_pending() -> int:
    """Uploaded lessons still waiting for a topic + timestamps (Cursor/Claude fills these in)."""
    state = load_state()
    sdata = students.load()
    found = 0
    for name, rec in state.items():
        if not rec.get("needs_topic") or not rec.get("video_id") or rec.get("status") not in ("uploaded", "verified"):
            continue
        p = settings.WATCH_DIR / name
        wd = lt.work_dir(p)
        tj = wd / "transcript.json"
        if not tj.is_file():
            continue
        timed = wd / "transcript_timed.txt"
        timed.write_text(lt.timed_text(json.loads(tj.read_text(encoding="utf-8"))), encoding="utf-8")
        st = students.by_key(sdata, rec["student"])
        print(f"PENDING | {students.label(st, rec.get('who'))} {rec['n']}/{rec['total']} | {name}")
        print(f"  transcript: {timed}")
        print(f"  write:      {wd / 'meta.json'}   ->  {{\"topic\": \"...\", \"chapters\": [{{\"t\": 0, \"title\": \"...\"}}]}}")
        print(f"  then run:   python run.py finish \"{name}\"")
        found += 1
    if not found:
        print("nothing pending")
    return 0


def cmd_safe() -> int:
    state = load_state()
    ok = [n for n, r in state.items() if r.get("status") == "verified"]
    print("Fully verified on YouTube (Clips agent deletes lesson/plate files after farming):")
    for n in ok:
        print("  ", settings.WATCH_DIR / n, "->", f"https://youtu.be/{state[n]['video_id']}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="YT Lesson Uploader")
    sub = ap.add_subparsers(dest="cmd")
    once_p = sub.add_parser("once")
    once_p.add_argument("--no-wait", action="store_true",
                        help="skip calendar wait (night uploads: file stable = ready)")
    sub.add_parser("status")
    sub.add_parser("safe-to-delete")
    sub.add_parser("pending")
    a = sub.add_parser("assign")
    a.add_argument("file"); a.add_argument("student"); a.add_argument("who", nargs="?")
    a.add_argument("--n", type=int)
    t = sub.add_parser("set-total")
    t.add_argument("student"); t.add_argument("total", type=int)
    inv = sub.add_parser("invoice"); inv.add_argument("student")
    f = sub.add_parser("finish"); f.add_argument("file")
    i = sub.add_parser("ignore"); i.add_argument("file")
    args = ap.parse_args()
    cmd = args.cmd or "once"
    if cmd == "once":
        if not getattr(args, "no_wait", False):
            import cal_guard
            cal_guard.wait_for_lessons()      # daytime: calendar lesson still going -> wait
        return cmd_once()
    return {"status": lambda: cmd_status(), "safe-to-delete": lambda: cmd_safe(), "pending": lambda: cmd_pending(),
            "assign": lambda: cmd_assign(args), "set-total": lambda: cmd_set_total(args),
            "finish": lambda: cmd_finish(args), "ignore": lambda: cmd_ignore(args),
            "invoice": lambda: invoices.cmd_invoice(args.student)}[cmd]()


if __name__ == "__main__":
    sys.exit(main())
