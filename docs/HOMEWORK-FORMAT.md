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
| **1** | `grammar-blank` | The grammar point only (e.g. 行きたい) | `(dictionary・conjugation)` e.g. `（いく・たい）` |
| **2** | `context-blank` | Everything except the grammar (open-ended) | Same hint on the fixed grammar visible in the sentence |

Section 1 items may include `"answer"` on blanks for future auto-check (not shown to students yet).

## Part types in `items[].parts`

- `{ "type": "text", "value": "トイレに" }`
- `{ "type": "blank", "name": "s1-1", "wide": true, "answer": "行きたい" }` — optional `answer` for Section 1
- `{ "type": "hint", "dictionary": "いく", "conjugation": "たい" }`

## Catalog fields

- `students` — usernames (lowercase) allowed to see the assignment
- `youtubeUrl` — latest lesson for that student
- `playlistUrl` — all lessons (top-level in catalog)
- `forSale` / `salePrice` — future PayPal `$0.99` archive for non-subscribers

## Pilot

- `2026-05-22-ben-m.json` — Ben M, ～がほしい vs ～に～たい・～がたい
- Source: `E:\OBS Recording New\Ben M Test.mp4` (local only)

Replace `REPLACE_YOUTUBE_*` in JSON when the unlisted video is up.
