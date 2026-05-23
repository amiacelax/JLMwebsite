# Agent guide — Japanese Language Mentor site

**Start here:** read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system map (pages, APIs, Discord, homework auth, videos, deploy gotchas).

## One-minute context

- **Cloudflare Worker** serves `public/` and handles `POST /api/contact` + `POST /api/promo-signup` → **Discord** `#website-inquiries` (`DISCORD_CHANNEL_ID=1507209734095241266`, secret `DISCORD_WEBHOOK_URL`).
- **No framework** — edit HTML + `public/css/styles.css` + small JS files; Worker is only `src/index.ts`.
- **Homework login** is client-side demo (`public/js/hw-auth.js`) — not real server auth yet.
- **Videos:** `public/videos/kash-lesson-commercial.mp4` for homepage “Watch a lesson”; check `public/.assetsignore` before assuming MP4 is deployed.

## Commands

```bash
npm run dev      # local :8787
npm run deploy   # production
```

Deploy docs: `docs/DEPLOY.md`. Future platform: `docs/NIHONGO-WEEKLY-PLATFORM.md`.

## Pickup rules

- Match existing CSS patterns; minimize diff scope.
- Don’t commit `.dev.vars` or webhook URLs.
- PayPal course links use `REPLACE_*` hosted_button_id placeholders until user supplies real URLs.
- Re-encode lesson video with ffmpeg (command in `docs/ARCHITECTURE.md`) if source `.mov` changes.
