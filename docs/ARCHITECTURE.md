# JLM Website — architecture map

**Purpose:** Onboarding doc for future agent sessions. Read this before large changes.

**Brand:** Japanese Language Mentor (JD) · **Production:** Cloudflare Worker `japanese-language-mentor`  
**Live URL:** https://japanese-language-mentor.jplang.workers.dev  
**Target domain:** japaneselanguagementor.com (DNS cutover per `docs/DEPLOY.md`)

---

## Stack (no React/Vite)

| Layer | Tech |
|--------|------|
| Hosting | Cloudflare Workers + **Workers Assets** (`public/`) |
| Worker | TypeScript `src/index.ts` — API routes + `env.ASSETS.fetch()` for static files |
| Frontend | Plain HTML, one global CSS `public/css/styles.css`, small vanilla JS modules |
| Config | `wrangler.toml`, secrets via `wrangler secret put` |
| Local secrets | `.dev.vars` (gitignored) — copy from `.dev.vars.example` |

```bash
npm run dev      # wrangler dev --live-reload → http://localhost:8787
npm run deploy   # wrangler deploy
```

---

## Request flow

```
Browser
  ├─ GET /path          → Worker → ASSETS (public/) — HTML/CSS/JS/images
  ├─ POST /api/contact  → Worker → Discord webhook + optional Resend email (Gmail)
  └─ POST /api/promo-signup → Worker → same Discord + optional Resend email
```

SPA fallback: `not_found_handling = "single-page-application"` in `wrangler.toml` (mostly static HTML pages today).

---

## Directory layout

```
c:\JLM Website\
├── src/index.ts              # Only server logic
├── public/
│   ├── index.html            # Homepage (hero, about, services, contact)
│   ├── games.html            # Games hub + promo modal
│   ├── homework.html         # Homework Hub landing + login
│   ├── courses.html          # Locked course cards + bundle banner
│   ├── homework/platform.html # Subscriber hub (auth-gated)
│   ├── css/styles.css        # Entire site theme (dark/light via data-theme)
│   ├── js/
│   │   ├── main.js           # Homepage only: theme, nav, contact form, lesson video toggle
│   │   ├── subpage.js        # Subpages: year, theme, mobile nav
│   │   ├── promo-email.js    # Promo modal on games/homework/courses
│   │   ├── hw-auth.js        # Client session auth (Phase 1 — replace later)
│   │   ├── hw-login.js       # homework.html login UI
│   │   └── hw-platform.js    # platform placeholders + worksheet demo
│   ├── game/                 # Self-contained browser game (separate CSS/JS)
│   ├── images/               # logo, jd-hero, torn-mask
│   └── videos/
│       └── kash-lesson-commercial.mp4   # Private Lessons “Watch a lesson” (see assetsignore)
├── docs/
│   ├── ARCHITECTURE.md       # This file
│   ├── DEPLOY.md             # Cloudflare + domain + Discord setup
│   └── NIHONGO-WEEKLY-PLATFORM.md  # Future phases (AI HW, PayPal, D1, etc.)
└── wrangler.toml
```

---

## Pages → scripts → APIs

| Page | Key UI | JS | Backend |
|------|--------|-----|---------|
| `index.html` | Contact form, services grid, lesson availability modal, **Watch a lesson** collapsible MP4 on Private Lessons card | `main.js` | `POST /api/contact` |
| `games.html` | Links to `/game/`, promo modal | `subpage.js`, `promo-email.js` | `POST /api/promo-signup` |
| `homework.html` | Tier plans, login inlay, paywall copy | `subpage.js`, `promo-email.js`, `hw-login.js`, `hw-auth.js` | promo API; login is **client-only** |
| `homework/platform.html` | Worksheet demo, placeholder cards | `hw-auth.js`, `hw-platform.js`, `subpage.js` | None yet |
| `courses.html` | Locked cards → PayPal URLs (placeholders), bundle `pricing-banner` | `subpage.js`, `promo-email.js` | promo API |
| `game/index.html` | Standalone game | `game/*.js`, `game.css` | None |

**Homepage nav:** `#about`, `#services-section`, `#contact` — `main.js` smooth-scroll + `data-service` prefill on contact `<select>`.

---

## Discord + Gmail (contact / promo)

- **Discord secret:** `DISCORD_WEBHOOK_URL` (production + `.dev.vars` local).
- **Gmail copies:** Worker → Cloudflare Email Routing (`SEND_EMAIL`) → `INQUIRY_EMAIL_TO` (default `languagementor.jp@gmail.com`). `Reply-To` is the visitor’s email so JD can hit Reply in Gmail. Optional Resend fallback if `RESEND_API_KEY` is set.
- **Setup:** see `docs/DEPLOY.md` → “Contact / promo → Gmail”.
- **Channel:** Discord notify channel ID `1534083802102501539` (`DISCORD_CHANNEL_ID` / `DISCORD_HOMEWORK_CHANNEL_ID` in `wrangler.toml`). Contact, promo, birthdays, social reminders, homework, and video upload pings all target this channel.
- Worker **GETs webhook metadata** before send; wrong channel → skip Discord (503 only if Resend email is also unavailable).
- Embeds: contact = red “new message”; promo = blue “promo email signup”.
- **Shorts/Reels social reminders:** cron `* * * * *` runs `runSocialReminders` (`src/social-reminders.ts`). Jobs live in `HOMEWORK_KV` (`sr-pending:*`). Arm with `POST /api/social-reminders` or `npm run arm:social -- --fire … --titles …`. Fires Discord + Teacher Hub `kind: reminder`. Default Story caption: `Free consultation ↑`. One Discord message with four copyable ``` blocks (title / pin / story / link).
- **Do not commit** webhook URLs; rotate if leaked.
- **Student DMs (publish / review ready):** `src/discord-notify.ts` uses bot token `DISCORD_BOT_TOKEN` + optional `DISCORD_TEACHER_USER_ID`. Discord user IDs live in KV (`student:{user}:discord-user-id`), set in Teacher Hub → Student info. Missing ID or DM failure → teacher DM, else homework webhook fallback. Never fails the HTTP publish/review response.
- **Teacher list name:** Teacher Hub → Student info → **Name in dropdown**. KV `student:{user}:teacher-list-name`. Dropdown only — not their hub name.
- **Bot health check:** `GET /api/discord-bot-status?teacherUsername=jlm` (teacher-only) probes `GET /users/@me` and returns `{ ok, botUsername?, hint }` without leaking the token. Teacher Hub → Student info → **Check Discord bot**.

---

## Homework / auth (Phase 1 only)

- `hw-auth.js`: `sessionStorage`/`localStorage` key `jlm-hw-session`; accounts in `ACCOUNTS` with **account label** (`current_student` | `homework_only`), **tier** (`tier1` Basic, `tier2` Premium, `tier3` Unlimited, `student_special`), and optional **video response unlock** (`$15/mo` add-on stored in `localStorage` until PayPal).
- Demo logins: `jlm` / `demo` (teacher); `benm` / `demo`, `joshs` / `jelly` (Current Student · Student Special); `deme` / `jelly` (Homework Only · Premium).
- `hw-platform.js` renders tier badges, Student Special **$5/mo weekly upgrade** CTA, and **HW Review Playlist** when video access is enabled; extra-HW / $0.99 UI removed.
- **PayPal (Homework):** Basic `P-3BS11069X4737034MNJ563OA`, Premium `P-7RC25164AJ430933DNJ564GY`, Ultra `P-9VC563511T5680357NJ565KA`, Student Special `P-34B653300B452420GNJ565WQ` (`HwCheckout.PRODUCTS` / `HwAuth.PAYPAL`). Prefer `POST /api/paypal/create-subscription` (needs `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`) → same-tab approve link with `return_url` → hub `?paid=1&plan=…` → `POST /api/auth/activate-plan`. Without PayPal API secrets, falls back to plain subscribe link + **I’ve paid — continue**. Arms HW-due reminders (Basic 21d; Premium/Ultra/SS 5d). The PayPal `subscriptionId` is stored on the KV user and cancelled with `POST /v1/billing/subscriptions/{id}/cancel` when the account is deleted; older plans without a stored id still need a manual PayPal cancel checkbox. **Webhooks:** remind at ~10 paying subscribers (see `.cursor/rules/paypal-webhooks-at-10.mdc`).
- **Bug reports:** Hub header **Bug report** captures a screenshot (html2canvas CDN) + optional comment → `POST /api/feature-report` (KV + Discord file) → Teacher Hub notifications (`GET /api/feature-report-image` for screenshot).
- `platform.html` calls `HwAuth.requireAuth()` inline in `<head>`.
- **Not production-safe** — server auth + D1 planned (`docs/NIHONGO-WEEKLY-PLATFORM.md`).

---

## Courses & PayPal (placeholders)

Each course card has a `.course-card__status-link` PayPal unlock pill with `REPLACE_*` IDs in `hosted_button_id` (including `REPLACE_STRATEGY` and `REPLACE_JOB_INTERVIEWS`). The full card is not a link. Bundle: `pricing-banner--link` → `REPLACE_BUNDLE`.

Replace IDs when real PayPal buttons exist; no Worker involvement yet.

---

## Media / video

| Asset | Use | Notes |
|--------|-----|--------|
| `kash-lesson-commercial.mp4` | Services → Private Lessons → `<details>` “Watch a lesson” | Encoded from Da Vinci export `.mov` via ffmpeg (720p, ~7.6 MB) |
| Source path (user machine) | `c:\External HD Copy\YouTube Edits\Da Vinci Export\Kash Lesson Commercial.mov` | Not in repo |

**Re-encode:**

```powershell
ffmpeg -y -i "c:\External HD Copy\YouTube Edits\Da Vinci Export\Kash Lesson Commercial.mov" -vf "scale=-2:720" -c:v libx264 -crf 26 -preset medium -c:a aac -b:a 96k -movflags +faststart -pix_fmt yuv420p "c:\JLM Website\public\videos\kash-lesson-commercial.mp4"
```

**Deploy gotcha:** `public/.assetsignore` lists `videos/`, `*.mp4`, `*.mov` — **videos may not upload with `wrangler deploy`**. If “Watch a lesson” 404s in prod, either remove those lines from `.assetsignore` (stay under ~25 MiB per file) or host on R2/YouTube and point `<video src>` there.

`.gitignore` ignores `public/videos/*.mov` (keep large sources out of git).

---

## Styling conventions

- CSS variables in `:root` / `[data-theme="light"]` at top of `styles.css`.
- Accent coral, green prices (`--color-green`), gold feature pills on service cards.
- Reusable patterns: `pricing-banner`, `service-cta`, `course-card--locked` (hover lock animation), `details` collapsible video (about-intro / service-card lesson).
- Subpages: `body.subpage`, shared header/footer, `data-promo-page` for promo modal title context.

---

## Environment & secrets

| Name | Where | Purpose |
|------|--------|---------|
| `DISCORD_WEBHOOK_URL` | Secret / `.dev.vars` | Outbound Discord posts |
| `DISCORD_CHANNEL_ID` | `wrangler.toml` [vars] | Validate webhook channel |
| `DISCORD_HOMEWORK_WEBHOOK_URL` | Secret / `.dev.vars` | Homework submissions + photo upload notifications |
| `DISCORD_HOMEWORK_CHANNEL_ID` | `wrangler.toml` [vars] | Validate homework webhook channel |
| `DISCORD_BOT_TOKEN` | Secret / `.dev.vars` | Bot DMs for publish / review-ready pings |
| `DISCORD_TEACHER_USER_ID` | Secret / `.dev.vars` | JD snowflake — fallback when student has no Discord ID |
| `PAYPAL_CLIENT_ID` | Secret / `.dev.vars` | PayPal REST app — subscription approve links + return URL |
| `PAYPAL_CLIENT_SECRET` | Secret / `.dev.vars` | PayPal REST app secret |
| `PAYPAL_MODE` | Optional vars / `.dev.vars` | `live` (default) or `sandbox` |
| `RESEND_API_KEY` | Secret / `.dev.vars` | Contact/promo → Gmail via Resend (optional) |
| `INQUIRY_EMAIL_TO` | `wrangler.toml` [vars] | Inbox (default `languagementor.jp@gmail.com`) |
| `INQUIRY_EMAIL_FROM` | `wrangler.toml` [vars] | From on Resend-verified domain |
| `ASSETS` | Worker binding | Static files from `public/` |

---

## Not built yet (don’t assume exists)

- Server-side homework auth, D1, R2 lesson storage
- PayPal **webhooks** / cancel automation (return URL + activate-plan is live; webhooks at ~10 subscribers)
- Real course unlock flow (cards are marketing + PayPal links only)
- Platform assignment pipeline (placeholders + demo worksheet)
- Resend domain verification / `RESEND_API_KEY` (code path ready; Discord-only until secret is set)

Roadmap detail: `docs/NIHONGO-WEEKLY-PLATFORM.md`.

---

## Common tasks (where to edit)

| Task | Files |
|------|--------|
| Homepage copy / services | `public/index.html`, `public/css/styles.css`, `public/js/main.js` |
| Contact / promo API behavior | `src/index.ts` |
| Homework tiers / login | `public/homework.html`, `public/js/hw-login.js`, `hw-auth.js` |
| Student hub UI | `public/homework/platform.html`, `public/js/hw-platform.js` |
| Courses pricing / PayPal | `public/courses.html` |
| Game | `public/game/*` |
| Deploy / Discord / domain | `docs/DEPLOY.md`, `wrangler.toml` |
| Theme colors / components | `public/css/styles.css` |

---

## Git / commits

- User prefers explicit ask before `git commit`.
- Never commit `.dev.vars`, webhook tokens, or large `.mov` files.

---

## Session changelog (high level)

Recent work agents should know about:

- Discord webhook retargeted to **website-inquiries** (`1507209734095241266`) with channel guard in Worker.
- **Courses:** $99 on cards, $199 bundle banner, PayPal placeholder URLs.
- **Homework hub:** “Pitch accent checker coming soon” on `homework.html`.
- **Private Lessons card:** “Watch a lesson” collapsible MP4 (`kash-lesson-commercial.mp4`), not “Book a lesson” link.

Update this section when shipping notable structural changes.
