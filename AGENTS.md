# Agent guide — Japanese Language Mentor site

**Start here:** read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system map (pages, APIs, Discord, homework auth, videos, deploy gotchas).

## One-minute context

- **Cloudflare Worker** serves `public/` and handles `POST /api/contact` + `POST /api/promo-signup` → **Discord** notify channel (`DISCORD_CHANNEL_ID=1534083802102501539`, secret `DISCORD_WEBHOOK_URL`). Homework / video submit uses the same channel (`DISCORD_HOMEWORK_*` can match).
- **No framework** — edit HTML + `public/css/styles.css` + small JS files; Worker is only `src/index.ts`.
- **Homework login** is client-side demo (`public/js/hw-auth.js`) — not real server auth yet.
- **Videos:** `public/videos/kash-lesson-commercial.mp4` for homepage “Watch a lesson”; check `public/.assetsignore` before assuming MP4 is deployed.

## Commands

```bash
npm run dev      # local :8787 with Wrangler live reload
npm run deploy   # production
```

**Deploy policy:** after any change, deploy automatically. Say **local** to skip. Do not ask permission.

Deploy docs: `docs/DEPLOY.md`. Future platform: `docs/NIHONGO-WEEKLY-PLATFORM.md`.

## Pickup rules

- Match existing CSS patterns; minimize diff scope.
- Don’t commit `.dev.vars` or webhook URLs.
- PayPal course links use `REPLACE_*` hosted_button_id placeholders until user supplies real URLs.
- Re-encode lesson video with ffmpeg (command in `docs/ARCHITECTURE.md`) if source `.mov` changes.

## Production vs local (“remove from live”)

- **`npm run deploy` uploads all of `public/`** — there is no separate “live-only” tree. Local-only behavior must use **feature flags** (`public/js/hw-feature-flags.js`), not deleted files or uncommitted local-only copies.
- **“Remove from live” / “disable in production”** → turn the feature off for production hostnames in `hw-feature-flags.js`. Do **not** delete source files, strip script tags, or remove local wiring unless the user explicitly asks to remove the feature from the **codebase**.
- **Before deleting** any feature’s JS/CSS or HTML includes, confirm the user wants it gone from the repo — not just off production.
- WIP example: magnifying glass is gated by `HwFeatureFlags.magnifyingGlass()` (on at `localhost` / `127.0.0.1` only). Production override for testing: `localStorage.setItem('hw-mg-dev','1')`.
