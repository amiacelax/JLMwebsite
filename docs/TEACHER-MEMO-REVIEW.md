# Teacher ↔ student memo review

End-to-end loop: student cloud memos on homework → teacher review → student sees Your notes / JD's notes → Notebook (later).

## Phase 1 — Done

- Student memos survive submit (`hw-homework-comments.js` → KV)
- Teacher: **Submissions → Review worksheet** — remark on memos, add question notes, **Submit notes**
- `POST /api/homework-review` sets `reviewStatus: reviewed`
- Student hub reads `reviewStatus` and fills review zone from submission comments
- Student **Open reviewed worksheet** uses the same blue+green pair UI (`studentReviewed`) — playback only (no delete / record / Add Note)
- Student **Done reviewing — ready for new homework** → `POST /api/homework-review-ack` sets `reviewStatus: acknowledged`, Discord ping, opens past homework

## Phase 1b — Flashcard review deck (usable)

**Goal:** Fastest path through a submission — one item at a time, not a long worksheet to scroll.

Like the Lookup Lexicon tab (one card, submit, next), but for homework review:

```
┌─────────────────────────────────────────┐
│  Card 3 of 12 · Ben M · 〜たい          │
│                                         │
│  Prompt: うんらべたいです                 │
│  Answer: 【うん、食べたいです。】          │
│                                         │
│  ☁ "Why たい here?"                     │
│                                         │
│  [ Remark on memo ]  [ Add note ]       │
│  [ Open in sheet ↗ ]     [ Done → ]     │
└─────────────────────────────────────────┘
```

**Rules**

- Deck = flattened list of **review units**: one text answer, one audio/video item, or one student cloud memo (memo cards may bundle prompt + their answer for context).
- **Done / Next** saves that unit's remark or note and never shows that card again in this submission's deck.
- **Open in sheet ↗** deep-links into the full Review worksheet at the right slide/question; if the card is a cloud memo, the sheet opens with that memo selected/focused automatically.
- When the deck is empty → **Submit notes** (marks submission reviewed) or optional "Review full sheet" for a sanity pass.
- Same data model as Phase 1 (`teacherRemark`, `author: teacher` notes) — flashcards are UI only, not a second storage shape.

**Entry points**

- Submissions row: **Review** opens flashcards (default); **Full sheet** opens the Phase 1 worksheet review.
- Phase 3 notification inbox → opens flashcard deck for that submission (later)

**Files:** `public/js/hw-review-flashcards.js`, `public/css/hw-review-flashcards.css` — wired from `hw-platform.js` / `hw-teacher-submissions.js`.
## Phase 2 — Notebook (MVP)

- When teacher **Submit notes** marks a submission `reviewed`, Worker auto-saves a **notebook pack** on that submission (`notebook` field) — no student “Save to Notebook” step.
- Student hub: **Notebook** section under Homework lists note pairs (student question/highlight · JD comment) + link to reopen the reviewed worksheet.
- **New Assignment Pending** / green-dot: skipped for MVP (auto-save removes the main need).

## Phase 3 — Teacher notification inbox

- "Faye submitted …" in teacher hub → deep-link into flashcard deck (Discord ping stays as today)

## Discord submit format (worksheet items)

Each numbered item:

```
1
   うんらべたいです
   【うん、食べたいです。】
```

- **Top:** question / prompt / expected line (no brackets)
- **Bottom:** student answer in `【】` (or `【Audio submitted】` + Listen · Download links)

Posted once on **Submit homework**, not on inline audio/video save.
