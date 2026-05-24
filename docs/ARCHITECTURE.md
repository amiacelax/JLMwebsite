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
npm run dev      # wrangler dev → http://localhost:8787
npm run deploy   # wrangler deploy
```

---

## Request flow

```
Browser
  ├─ GET /path          → Worker → ASSETS (public/) — HTML/CSS/JS/images
  ├─ POST /api/contact  → Worker → Discord webhook embed
  └─ POST /api/promo-signup → Worker → same Discord webhook
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
| `index.html` | Contact form, services grid, **Watch a lesson** collapsible MP4 on Private Lessons card | `main.js` | `POST /api/contact` |
| `games.html` | Links to `/game/`, promo modal | `subpage.js`, `promo-email.js` | `POST /api/promo-signup` |
| `homework.html` | Tier plans, login inlay, paywall copy | `subpage.js`, `promo-email.js`, `hw-login.js`, `hw-auth.js` | promo API; login is **client-only** |
| `homework/platform.html` | Worksheet demo, placeholder cards | `hw-auth.js`, `hw-platform.js`, `subpage.js` | None yet |
| `courses.html` | Locked cards → PayPal URLs (placeholders), bundle `pricing-banner` | `subpage.js`, `promo-email.js` | promo API |
| `game/index.html` | Standalone game | `game/*.js`, `game.css` | None |

**Homepage nav:** `#about`, `#services-section`, `#contact` — `main.js` smooth-scroll + `data-service` prefill on contact `<select>`.

---

## Discord notifications

- **Secret:** `DISCORD_WEBHOOK_URL` (production + `.dev.vars` local).
- **Channel:** `#website-inquiries` — ID `1507209734095241266` (`DISCORD_CHANNEL_ID` in `wrangler.toml`).
- Worker **GETs webhook metadata** before send; wrong channel → 503 (no silent post to #rules).
- Embeds: contact = red “new message”; promo = blue “promo email signup”.
- **Do not commit** webhook URLs; rotate if leaked.

---

## Homework / auth (Phase 1 only)

- `hw-auth.js`: `sessionStorage`/`localStorage` key `jlm-hw-session`; demo password `demo` for accounts in `ACCOUNTS` map (e.g. `japaneselanguagementor`).
- `platform.html` calls `HwAuth.requireAuth()` inline in `<head>`.
- **Not production-safe** — server auth + D1 planned (`docs/NIHONGO-WEEKLY-PLATFORM.md`).

---

## Courses & PayPal (placeholders)

Each `course-card` is an `<a>` to PayPal hosted-button URLs with `REPLACE_*` IDs in `hosted_button_id` (including `REPLACE_STRATEGY` for Language Learning Strategy). Bundle: `pricing-banner--link` → `REPLACE_BUNDLE`.

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
| `ASSETS` | Worker binding | Static files from `public/` |

---

## Not built yet (don’t assume exists)

- Server-side homework auth, D1, R2 lesson storage
- PayPal webhooks / tier automation
- Real course unlock flow (cards are marketing + PayPal links only)
- Platform assignment pipeline (placeholders + demo worksheet)
- Email sending (Discord only for contact/promo)

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
