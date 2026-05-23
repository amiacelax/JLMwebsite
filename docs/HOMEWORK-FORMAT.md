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
| **2** | `context-blank` | Everything except the grammar (open-ended) | Same — hint nested on the blank |

Section 1 blanks may include `"answer"` for auto-check (stored in `data-answer`, not shown to students).

### Section 1 header (optional)

- `"tenseBubbles": ["Now-Later", "Past"]` — two tense guides beside the section title (non-past vs past)
- `"activeTense": "Now-Later"` — which pill is highlighted (guide only for now)

### Negative items (optional)

- `"negative": true` on an item — red `NEGATIVE` pill after the sentence; answer should be negative (e.g. `ほしくない`)
- Hints omit conjugation when it is `たい` or `plain` — show `（いく）` not `（いく・たい）`; other tags like `ない` still show `（ほしい・ない）`

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
