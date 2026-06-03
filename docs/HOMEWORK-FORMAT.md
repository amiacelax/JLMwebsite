# Homework JSON format (fillable worksheets)

Reusable assignments live in `public/homework/assignments/{id}.json`. The catalog `public/homework/catalog.json` lists published sheets, YouTube links, which students can open them, and future `$0.99` archive sales.

## Pipeline (target)

```
Lesson video (OBS) → transcribe → LLM draft JSON → JD review → publish JSON + catalog entry
YouTube: unlisted full lesson (link only on site, not hosted in repo)
```

## Section types

| Section | `mode` | Student fills | Hint shows |
|---------|--------|---------------|------------|
| **1** | `grammar-blank` | The grammar point only (e.g. 行きたい) | Under the blank: `（いく・たい）` |
| **2** | `context-blank` | Three wide open blanks (one per line) | Optional on blank |

Default layout: **5** grammar lines (Section 1) + **3** open lines (Section 2). Check **Question** on a Section 2 line to show the blue **QUESTION** pill (same pattern as **Negative**).

Section 1 blanks may include `"answer"` and `"variants"` for the teacher editor only — students do not see keys; JD reviews submissions on Discord (no auto-check for now).

### Section 1 header (optional)

- `"tenseBubbles": ["Now-Later", "Past"]` — two tense guides beside the section title (non-past vs past)
- `"activeTense": "Now-Later"` — which pill is highlighted (guide only for now)

### Negative items (optional)

- `"negative": true` on an item — red `NEGATIVE` pill after the sentence; answer should be negative (e.g. `ほしくない`)
- `"question": true` on a Section 2 item — blue **QUESTION** pill after the blank (teacher checks **Question** in the maker, same as **Negative**)
- Hints omit conjugation when it is `たい`, `plain`, or `ない` — show `（ほしい）` not `（ほしい・ない）`

## Teacher hub (`jlm` demo)

- Account role `teacher` in `hw-auth.js` — **Teacher's hub** with worksheet library (all catalog entries)
- **Homework maker** — enter **student id** + **grammar point** (e.g. `～ないといけない`) → **Generate with AI** (`POST /api/homework-generate`, needs `OPENAI_API_KEY`)
- File id auto: `{studentid}-{grammar-slug}` (e.g. `benm-naitoikenai`)
- Optional **YouTube** URL → catalog + student “latest lesson” card
- `benm` demo = student test site (assignments filtered by `students` in catalog)
- Teacher actions: Preview, Download JSON, Copy catalog entry, Copy student link (`platform.html#hw-{id}`), load template / **Edit in maker**

### Variants (teacher / future auto-check)

Section 1 blanks may use `variants` on each blank (for polite/casual and tense keys). Student-facing register/tense toggles are off while grading is manual.

```json
"variants": {
  "casual": { "Now-Later": "行かないといけない", "Past": "行かなかった" },
  "polite": { "Now-Later": "行かないといけません", "Past": "行かなかった" }
}
```

AI generation should fill this grid. Legacy sheets with a single `answer` still work (no toggle effect).

### Manual line format (advanced)

One sentence per line:

```
text before {answer} text after | dictionary | conjugation
```

Section 2: empty `{ }` for open blanks. Prefix `!` for **NEGATIVE** (Section 1). Prefix `?` for **QUESTION** (Section 2).

Publish: save JSON under `public/homework/assignments/`, add catalog entry, `npm run deploy`, send student link.

## Part types in `items[].parts`

- `{ "type": "text", "value": "トイレに" }`
- `{ "type": "text", "ruby": [{ "text": "新", "rt": "あたら" }, { "text": "しい車が" }] }` — furigana above kanji
- `{ "type": "blank", "name": "s1-1", "wide": true, "answer": "行きたい", "hint": { "dictionary": "いく", "conjugation": "たい" } }`
- Legacy: `{ "type": "hint", "dictionary": "いく", "conjugation": "たい" }` after a blank still works (moved under the blank)

## Speech register (optional)

- `"register": "casual"` or `"polite"` — shows **Casual** / **Polite** pills on the worksheet; the lesson’s register is highlighted, the other is greyed out.

## Catalog fields

- `students` — usernames (lowercase) allowed to see the assignment
- `youtubeUrl` — latest lesson for that student
- `lessonPlaylistUrl` — per-student YouTube lesson playlist; Worker reads the public RSS feed and sets `latestLessonUrl` to the last video in the feed (newest at bottom of playlist, ~1h cache)
- `playlistUrl` — all lessons (top-level in catalog)
- `forSale` / `salePrice` — future PayPal `$0.99` archive for non-subscribers

## Pilot

- `2026-05-22-ben-m.json` — Ben M, ～がほしい vs ～に～たい・～がたい
- Lesson: `2026-05-22 Ben M 24` · source `E:\OBS Recording New\2026-05-22 Ben M 24.mp4` (local only)

Replace `REPLACE_YOUTUBE_*` in JSON when the unlisted video is up.

## Submit → Discord

Students click **Submit homework**. The Worker posts to `#homework` channel (`DISCORD_HOMEWORK_CHANNEL_ID`).

Secrets (production + `.dev.vars`):

```bash
wrangler secret put DISCORD_HOMEWORK_WEBHOOK_URL
```

Create the webhook in Discord for channel `1507650471836258404`.
