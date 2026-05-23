# Japanese Language Mentor

Professional website for JD's Japanese language teaching business, built on Cloudflare Workers with static assets.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) to preview locally.

## Deploy

```bash
npm run deploy
```

## Architecture (for agents & future work)

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full layout (pages, APIs, Discord, homework, media, deploy). Cursor agents: **[AGENTS.md](AGENTS.md)** points there first.

## Project structure

```
├── public/           Static assets (HTML, CSS, JS)
│   ├── index.html
│   ├── css/styles.css
│   └── js/main.js
├── src/
│   └── index.ts      Worker — serves assets + /api/contact handler
├── wrangler.toml     Cloudflare Workers config
└── package.json
```

## Contact form → Discord

Submissions POST to `/api/contact`. The Worker sends a formatted message to a **Discord channel webhook** (no email).

### Setup (#website-inquiries)

Channel ID: `1507209734095241266` (must match `DISCORD_CHANNEL_ID` in `wrangler.toml`).

1. Open **#website-inquiries** in Discord (not #rules).
2. **Edit Channel** (gear) → **Integrations** → **Webhooks** → **New Webhook**
3. Name it e.g. `JLM Website`, confirm channel is **website-inquiries**, **Copy Webhook URL**  
   (Looks like `https://discord.com/api/webhooks/123456789/abcdef...` — not your `discord.gg` invite link.)

   If you already have a webhook posting to the wrong channel: **Server Settings → Integrations → Webhooks** → edit it → change **Channel** to **website-inquiries**.

4. **Local dev:** copy `.dev.vars.example` to `.dev.vars` and paste your URL:
   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   DISCORD_CHANNEL_ID=1507209734095241266
   ```
5. **Production:** store the URL as a secret (do not commit it):
   ```bash
   npx wrangler secret put DISCORD_WEBHOOK_URL
   ```
   Paste the webhook URL when prompted, then redeploy.

The **Send a Message** buttons on the site only scroll to the contact form. Email is sent when the visitor submits the form with name, email, and message.

### Promo email signups (Games / Homework / Courses)

Pages `/games.html`, `/homework.html`, and `/courses.html` show a promo modal. Submissions POST to `/api/promo-signup` and appear in the same Discord channel as **Website inquiries — promo email signup**.

## Features

- Dark / light mode with system preference fallback
- Responsive navbar with mobile menu
- Edge-optimized static assets via Cloudflare Workers
- Sections: Hero, About, Services, Portfolio, Contact
