# Nihongo Weekly platform — architecture (draft)

This doc maps your vision into build phases. The homework page is the student-facing shell; most automation lives in backend services you control.

## End-to-end flow (target)

```
OBS lesson recording
    → upload / trigger (watch folder, manual upload, or OBS webhook)
    → AI pipeline (transcribe → summarize lesson → draft HW)
    → Discord #hw-review (draft + transcript snippet for you)
    → You approve / edit in thread or web admin
    → Publish: student account + optional PDF export
    → Discord DM student: HW ready + YouTube lesson link
    → (Parallel) clip + social + full YouTube upload per rules
```

## Phase 1 — Now (website)

- [x] Homework landing: login, tiers, Nihongo Weekly copy
- [x] Client session login → `/homework/platform.html` (Discord username + demo password)
- [x] Student hub: fillable worksheet + placeholder cards (assignments, lesson, upload, extra HW)
- [ ] PayPal links per tier (replace placeholders)
- [ ] Server-side auth (Phase 2 — move accounts out of `hw-auth.js`)

## Phase 2 — Accounts & content store

**Auth options (pick one):**

| Option | Pros | Cons |
|--------|------|------|
| Cloudflare Access + email | Simple for small student list | Less custom UX |
| Workers + D1 + signed cookies | Full control on your domain | You build login/session |
| Clerk / Auth0 | Fast, secure | Monthly cost |

**Storage:**

- Cloudflare R2 — lesson videos (private), generated HW JSON/HTML
- D1 — users, subscriptions, assignments, review status
- Each HW document: `{ lessonId, studentId, template, blanks[], status, youtubeUrl }`

**Student dashboard:** list assignments, open fillable viewer, submit answers (saved to D1).

## Phase 3 — AI homework generation

**Input:** lesson video or audio extract.

**Steps:**

1. **Transcribe** — Whisper (API) or Deepgram; Japanese + timestamps.
2. **Draft HW** — LLM with your **system prompt + few-shot examples** of approved past HW (this is your “training” — not fine-tuning at first).
3. **Structured output** — JSON schema, e.g.:

```json
{
  "title": "Lesson 2026-05-20 — たい form",
  "lines": [
    { "type": "text", "content": "昨日は何を" },
    { "type": "blank", "id": "b1", "width": "12em", "hint": "" },
    { "type": "text", "content": "しましたか。" }
  ],
  "notesForJD": "Pulled たい from minute 12–18"
}
```

4. **Render** — HTML fillable template (same as preview on site) or generate PDF via Puppeteer later.

**Review loop (important for quality):**

- Post draft to Discord webhook with buttons/links to admin edit page.
- You edit → mark `approved` → triggers publish + student notification.
- Store **diff** (AI draft vs your final) → periodically add best pairs to prompt “golden examples.” That’s the practical training loop without custom model training.

## Phase 4 — Discord notifications

- **#hw-review** — incoming drafts (existing webhook pattern in `src/index.ts`).
- **Student DMs** — Discord Bot (not webhook) with OAuth bot token; map `discordUserId` in D1.
- Message template: “Homework ready” + link to `/homework/assignments/{id}` + YouTube lesson link.

## Phase 5 — Extra homework allowances / $0.99 overage

- PayPal “Buy Now” or Subscription button → webhook (PayPal IPN or newer webhooks) → Worker creates `extra_hw_request` row → same AI draft → your review → deliver.
- Current product notes: Monthly includes 1 extra HW request/month, Daily includes unlimited extra HW, and overage requests are $0.99 each or an upgrade prompt.
- Higher tiers should support "Immersion Now" prompts: small, immediate immersion/input tasks attached to the assignment so students can use the grammar in real context right away.
- Higher tiers should support personalized video responses for each submitted assignment; JD explains mistakes and grammar points so students get visual/audio reinforcement in addition to written corrections.

## Course idea notes — Language Learning Strategy

- Course promise: explain the strategies JD used to become a native-level Japanese speaker.
- Angle: many of the same strategies are also used naturally by children, even if adult learners usually do not think to copy them.
- Potential modules:
  - Immersion setup that works immediately instead of waiting until "advanced" level.
  - Pattern noticing: collect repeated grammar, pronunciation, and phrasing from real input.
  - High-repetition listening and shadowing before full analytical understanding.
  - Output loops: speak/write, notice the gap, get correction, repeat.
  - Memory through multiple senses: reading, listening, speaking, handwriting/typing, and video explanations.
  - Build a personal environment where Japanese becomes the default for small daily tasks.

## Phase 6 — Video automation (clips + YouTube)

Separate worker/cron job; do **not** block HW on this.

| Step | Tool ideas |
|------|------------|
| Detect highlights | LLM on transcript + your rules (“intro”, “example”, “homework recap”) |
| Cut clips | ffmpeg on VPS, Cloudflare Stream, or Remotion |
| YouTube full upload | YouTube Data API — title template, unlisted, playlist ID |
| Shorts / Reels / X | Manual approval queue at first; auto-post only after you trust clips |

**Safety:** always human approve first N months; keep “unlisted until approved” default.

## Fillable homework in browser

- Implemented as HTML: Japanese text + `<input class="hw-blank">` / contenteditable spans.
- Student answers: `localStorage` while typing, then `POST /api/homework-submit` to the homework Discord channel.
- Printed-paper upload path: `POST /api/homework-photo-upload` forwards the image directly to Discord. This avoids R2 for now; uploads are not stored on the site.
- **Print:** `@media print` hides nav/login; blanks show underline.
- **PDF export (later):** print-to-PDF from browser, or server-side Puppeteer from same HTML.

## What not to do yet

- Full RPG / game integration with HW
- Fully unattended AI publish without your review
- Training a custom model before you have 20–50 approved HW examples

## Suggested next build order

1. PayPal tier links + contact fallback  
2. D1 schema + admin-only “paste approved HW JSON” publish  
3. Discord review webhook for drafts  
4. Whisper + LLM draft endpoint (manual trigger per file)  
5. Student login + assignment viewer  
6. YouTube + clip automation  
