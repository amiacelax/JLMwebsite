"""Auto spoken captions + end-card CTA as an ASS subtitle file (1080x1920).

Style matches JD's existing Shorts (.tmp-batchD3/E1): blue #55aaff text, black
outline, Open Sans (Yu Gothic for Japanese). Caption rules (caption-oneblock-punctuation.mdc):
NEVER show , . ; : ― 、 。 on screen — slides break on pauses/sentence ends instead.

Layout (JD is a 1080x1080 square at the bottom, y 840-1920): spoken captions sit in
the open background just above his head, toppers at the very top, end card centered.
"""
from __future__ import annotations

import re
from pathlib import Path

from PIL import ImageFont

import pills

BLUE = "&H00FFAA55"
BLACK = "&H00000000"
WHITE = "&H00FFFFFF"
ORANGE = "&H00233CEE"

SPOKEN_SIZE = 100
SPOKEN_OUTLINE = 4.2
SPOKEN_MARGIN_V = 1020      # text bottom edge ~y=900, above JD's head
CTA_TITLE_SIZE = 170
CTA_URL_SIZE = 90
MAX_LINE_PX = 900   # frame is 1080 wide, 60px margins each side + safety
MAX_LINES = 2
PAUSE_BREAK = 0.7           # seconds of silence that starts a new slide
MAX_SLIDE_SEC = 3.6

_FONTS = Path(__file__).parent / "assets" / "fonts"
JP_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]+")
BANNED = str.maketrans("", "", ",.;:―、。")
SENTENCE_END = re.compile(r"[.!?。]$")


def _font(path: Path, size: int):
    try:
        return ImageFont.truetype(str(path), size, index=0)
    except Exception:
        return None


_LATIN = {}
_JP = {}


# libass sizes a font so (winAscent+winDescent) == Fontsize, so the real glyph em is
# smaller than Fontsize. Measured by rendering: Yu Gothic Bold 100 -> ~77px/char.
WIN_HEIGHT_LATIN = 1.442   # Open Sans Bold
WIN_HEIGHT_JP = 1.287      # Yu Gothic Bold


def join_words(words: list[str], sps: list[bool] | None = None) -> str:
    """Join with spaces — except between two Japanese chunks (Japanese has no spaces),
    and except where Whisper split one word into pieces (sps[i] False = glue to previous)."""
    out = ""
    for i, w in enumerate(words):
        glued = sps is not None and not sps[i]
        if out and not glued and not (JP_RE.match(out[-1]) and JP_RE.match(w[:1])):
            out += " "
        out += w
    return out


def restore_spacing(segments: list[dict]) -> None:
    """Older words.json lacks 'sp'. Recover it by aligning each word to its segment text."""
    for seg in segments:
        text, pos = seg.get("text") or "", 0
        for w in seg.get("words", []):
            if "sp" in w:
                continue
            tok = w.get("word") or ""
            idx = text.find(tok, pos) if tok else -1
            if idx < 0:
                w["sp"] = True
                continue
            w["sp"] = idx == 0 or idx > pos or text[idx - 1] == " "
            pos = idx + len(tok)


def width(text: str, fs: float = SPOKEN_SIZE) -> float:
    """Rendered pixel width: Latin via Open Sans Bold, Japanese runs via Yu Gothic Bold."""
    size_lat = max(1, int(round(fs / WIN_HEIGHT_LATIN)))
    size_jp = max(1, int(round(fs / WIN_HEIGHT_JP)))
    lat = _LATIN.setdefault(size_lat, _font(_FONTS / "OpenSans-Bold.ttf", size_lat))
    jp = _JP.setdefault(size_jp, _font(_FONTS / "YuGothB.ttc", size_jp))
    size = int(round(fs))
    total, i = 0.0, 0
    while i < len(text):
        m = JP_RE.match(text, i)
        if m:
            total += jp.getlength(m.group(0)) if jp else size * len(m.group(0))
            i = m.end()
        else:
            j = i + 1
            while j < len(text) and not JP_RE.match(text, j):
                j += 1
            total += lat.getlength(text[i:j]) if lat else size * 0.55 * (j - i)
            i = j
    return total


def ass_time(sec: float) -> str:
    sec = max(0.0, sec)
    h, m = int(sec // 3600), int((sec % 3600) // 60)
    s = int(sec % 60)
    cs = int(round((sec - int(sec)) * 100))
    if cs >= 100:
        s, cs = s + 1, 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


# --- slides ------------------------------------------------------------------
COLORS = {
    "red": "&H000000FF",       # wrong / can't say
    "green": "&H0000FF55",     # right / do say (#55ff00)
    "blue": BLUE,
    "orange": ORANGE,
    "gold": "&H0000B4FF",
    "white": WHITE,
}
# {text:color} markup — same notation as JD's old oneblock .txt files
TAG_RE = re.compile(r"\{([^{}:]+):(red|green|blue|orange|gold|white)\}")


def clean_markup(line: str) -> str:
    """Strip banned punctuation from a markup line without touching the {text:color} syntax."""
    out, pos = [], 0
    for m in TAG_RE.finditer(line):
        out.append(line[pos:m.start()].translate(BANNED))
        out.append("{" + m.group(1).translate(BANNED) + ":" + m.group(2) + "}")
        pos = m.end()
    out.append(line[pos:].translate(BANNED))
    return "".join(out)


def _render_line(items: list[dict]) -> str:
    """Join word items into a line, wrapping runs of the same verdict color in {text:color}."""
    groups: list[list] = []
    for it in items:
        c = it.get("color")
        if groups and groups[-1][0] == c:
            groups[-1][1].append(it["t"])
            groups[-1][2].append(it.get("sp", True))
        else:
            groups.append([c, [it["t"]], [it.get("sp", True)]])
    out, prev_last = "", ""
    for c, texts, sps in groups:
        seg = join_words(texts, sps)
        if prev_last and sps[0] and not (JP_RE.match(prev_last) and JP_RE.match(seg[:1])):
            out += " "
        out += ("{" + seg + ":" + c + "}") if c else seg
        prev_last = seg[-1:]
    return out


def _verdict_for(item: dict, marks: list[dict]) -> str | None:
    mid = (item["s"] + item["e"]) / 2
    is_jp = bool(JP_RE.search(item["t"]))
    for mk in marks:
        if mk["start"] - 0.03 <= mid <= mk["end"] + 0.03 and (is_jp or not mk.get("has_jp")):
            return "red" if mk["verdict"] == "wrong" else "green"
    return None


def build_slides(words: list[dict], marks: list[dict] | None = None) -> list[dict]:
    """words: [{start,end,word}] already relative to the clip. -> [{start,end,lines}]

    marks (clip-relative [{start,end,verdict:'wrong'|'right'}]) color the matching spoken
    words red (wrong) / green (right); lines then carry {text:color} markup.
    """
    marks = [dict(m) for m in (marks or [])]
    for mk in marks:  # does the marked stretch contain Japanese? (JP-only coloring if so)
        mk["has_jp"] = any(JP_RE.search(w.get("word") or "") and mk["start"] - 0.03 <= (float(w["start"]) + float(w["end"])) / 2 <= mk["end"] + 0.03
                           for w in words)
    slides: list[dict] = []
    cur = None  # {start,end,lines:[[word items]]}

    def flush():
        nonlocal cur
        if cur and any(cur["lines"]):
            slides.append({"start": cur["start"], "end": cur["end"],
                           "lines": [_render_line(l) for l in cur["lines"] if l]})
        cur = None

    def joined(line, extra=None):
        its = line + ([extra] if extra else [])
        return join_words([x["t"] for x in its], [x.get("sp", True) for x in its])

    prev_end = None
    for w in words:
        raw = (w.get("word") or "").strip()
        shown = raw.translate(BANNED).strip()
        if not shown:
            continue
        ends_sentence = bool(SENTENCE_END.search(raw))
        start, end = float(w["start"]), float(w["end"])
        item = {"t": shown, "s": start, "e": end, "sp": w.get("sp", True)}
        item["color"] = _verdict_for(item, marks)

        if cur and prev_end is not None and start - prev_end > PAUSE_BREAK:
            flush()
        if cur and end - cur["start"] > MAX_SLIDE_SEC:
            flush()

        if cur is None:
            cur = {"start": start, "end": end, "lines": [[item]]}
        else:
            line = cur["lines"][-1]
            if width(joined(line, item)) <= MAX_LINE_PX:
                line.append(item)
            else:
                # don't split a colored (wrong/right) phrase across lines: carry it down whole
                # never split a word ("it" + "'s") or a colored (wrong/right) phrase across lines
                carry, first = [], item
                while len(line) > 1 and (not first.get("sp", True) or
                                         (first["color"] and line[-1]["color"] == first["color"])):
                    first = line.pop()
                    carry.insert(0, first)
                if len(cur["lines"]) < MAX_LINES:
                    cur["lines"].append(carry + [item])
                else:
                    # slide full: carried words (if any) start the next slide with the new item
                    flush_start = carry[0]["s"] if carry else start
                    flush()
                    cur = {"start": flush_start, "end": end, "lines": [carry + [item]]}
        cur["end"] = end
        prev_end = end
        if ends_sentence:
            flush()
    flush()

    # Timing: hold a hair past the last word; bridge tiny gaps so captions don't flicker.
    for i, s in enumerate(slides):
        s["end"] = s["end"] + 0.12
        if i + 1 < len(slides):
            nxt = slides[i + 1]["start"]
            if nxt - s["end"] < 0.45:
                s["end"] = max(s["start"] + 0.2, nxt - 0.02)
            s["end"] = min(s["end"], nxt - 0.02) if nxt > s["start"] else s["end"]
    return slides


def _jp_runs(text: str) -> str:
    return JP_RE.sub(lambda m: f"{{\\fnYu Gothic}}{m.group(0)}{{\\fnOpen Sans}}", text)


def markup_to_ass(line: str) -> str:
    """'I can't say {あついで:red}' -> ASS text with the colored span + Yu Gothic for Japanese."""
    out, pos = [], 0
    for m in TAG_RE.finditer(line):
        out.append(_jp_runs(line[pos:m.start()]))
        out.append(f"{{\\c{COLORS[m.group(2)]}&}}" + _jp_runs(m.group(1)) + f"{{\\c{BLUE}&}}")
        pos = m.end()
    out.append(_jp_runs(line[pos:]))
    return "".join(out)


# --- ASS ---------------------------------------------------------------------
def build_ass(slides: list[dict], total: float, cta_start: float,
              topper_en: str = "", topper_jp: str = "", url_text: str = "japaneselanguagementor.com",
              cta_title: str = "Book a\\Ntrial lesson") -> str:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Pill,Arial,40,{WHITE},{WHITE},{BLACK},{BLACK},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: TopText,Yu Gothic,{pills.TOP_EN_SIZE},{WHITE},{WHITE},{BLACK},{BLACK},-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: Spoken,Open Sans,{SPOKEN_SIZE},{BLUE},{BLUE},{BLACK},{BLACK},-1,0,0,0,100,100,0,0,1,{SPOKEN_OUTLINE},0,2,60,60,{SPOKEN_MARGIN_V},1
Style: CtaTitle,Open Sans,{CTA_TITLE_SIZE},{WHITE},{WHITE},{BLACK},{BLACK},-1,0,0,0,100,100,0,0,1,7,0,5,40,40,0,1
Style: CtaUrl,Open Sans,{CTA_URL_SIZE},{ORANGE},{WHITE},{BLACK},{BLACK},-1,0,0,0,100,100,0,0,1,5,0,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev: list[str] = []
    if topper_en or topper_jp:
        ev += pills.topper_events(topper_en, topper_jp, "0:00:00.00", ass_time(cta_start))
    for s in slides:
        end = min(s["end"], cta_start)
        if end <= s["start"]:
            continue
        body = "\\N".join(markup_to_ass(l) for l in s["lines"])
        ev.append(f"Dialogue: 0,{ass_time(s['start'])},{ass_time(end)},Spoken,,0,0,0,,{body}")
    ev.append(f"Dialogue: 2,{ass_time(cta_start)},{ass_time(total)},CtaTitle,,0,0,0,,"
              f"{{\\pos(540,920)}}{cta_title}")
    ev.append(f"Dialogue: 2,{ass_time(cta_start)},{ass_time(total)},CtaUrl,,0,0,0,,"
              f"{{\\pos(540,1280)}}{url_text}")
    return header + "\n".join(ev) + "\n"
