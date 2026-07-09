# Teacher ↔ student memo review

End-to-end loop: student cloud memos on homework → teacher review → student sees Your notes / JD's notes → Notebook (later).

## Phase 1 — Done

- Student memos survive submit (`hw-homework-comments.js` → KV)
- Teacher: **Submissions → Review worksheet** — remark on memos, add question notes, **Submit notes**
- `POST /api/homework-review` sets `reviewStatus: reviewed`
- Student hub reads `reviewStatus` and fills review zone from submission comments

## Phase 1b — Flashcard review deck (planned)

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

**Entry points (later)**

- Submissions row: **Review** → choose **Flashcards** (default) or **Full sheet**
- Phase 3 notification inbox → opens flashcard deck for that submission

## Phase 2 — Notebook + pending next assignment

- On submit: stage student memos for Notebook under the HW section
- After reviewed: **Save to Notebook** persists student + JD notes
- New assignment while an unsaved reviewed pack exists → **New Assignment Pending** + green dot

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
