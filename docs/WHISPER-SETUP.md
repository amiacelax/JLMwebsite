# Local Whisper (free) — lesson transcripts

Use this to turn OBS recordings into text for homework drafts. **No API key, no per-minute fee.**

## One-time setup (Windows)

1. Open **PowerShell**.
2. Install the Python package (downloads the engine once):

```powershell
pip install faster-whisper
```

You already have **Python** and **ffmpeg** on this machine — that’s all you need.

**First run** also downloads the model weights (~150 MB for `small`, more for `medium`). Internet required once per model size.

## Transcribe a lesson

From the project folder:

```powershell
cd "c:\JLM Website"
.\scripts\transcribe-lesson.ps1 "E:\OBS Recording New\2026-05-22 Ben M 24.mp4"
```

Or directly:

```powershell
python scripts/transcribe_lesson.py "E:\OBS Recording New\2026-05-22 Ben M 24.mp4"
```

**Output** (next to the video, unless you pass `--out-dir`):

- `2026-05-22 Ben M 24-transcript.txt` — timestamps + text (for you + AI homework draft)
- `2026-05-22 Ben M 24-transcript.vtt` — subtitles file (optional upload to YouTube)

## Model speed vs quality

| Model | Quality | ~65 min lesson on CPU |
|-------|---------|------------------------|
| `tiny` / `base` | OK for tests | ~15–40 min |
| `small` (default) | Good for Japanese | ~30–90 min |
| `medium` | Better | Longer |
| `large-v3` | Best | Very slow on CPU |

Faster test:

```powershell
.\scripts\transcribe-lesson.ps1 "E:\OBS Recording New\2026-05-22 Ben M 24.mp4" -Model base
```

## English + Japanese in the same lesson

Default is **auto-detect** per segment, with a prompt that says the lesson mixes English and Japanese.

- Do **not** force `-Language ja` only — English explanations may get garbled.
- Optional force: `--language ja` only if the lesson is almost all Japanese.

## After transcription

1. Skim `*-transcript.txt` and fix obvious names / Japanese mistakes.
2. Send the file (or paste key sections) when asking for homework JSON updates.
3. Future: automate draft → `public/homework/assignments/*.json`.

## Paid alternative (optional)

OpenAI **Whisper API** charges per minute. You don’t need it if local Whisper is fine.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `pip not found` | Use `py -m pip install faster-whisper` |
| `File not found` | Quote paths with spaces |
| Very slow | Use `-Model base` or `tiny` first |
| Out of memory | Use `small` or `base`, not `large-v3` on CPU |
