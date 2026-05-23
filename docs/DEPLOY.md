# Deploy Japanese Language Mentor (Cloudflare)

Your site is a **Cloudflare Worker** + static files in `public/`. Production account: **languagementor.jp@gmail.com**.

## Quick deploy (after one-time setup)

```powershell
cd "c:\JLM Website"
npx.cmd wrangler deploy
```

Discord webhook is already set in production as `DISCORD_WEBHOOK_URL`. It must post to **#website-inquiries** (channel ID `1507209734095241266`). If messages land in **#rules** instead, the webhook was created on the wrong channel — fix in Discord (below), not in site code.

---

## One-time: enable a public URL

Deploy failed last time because your account still needs a **workers.dev** subdomain (one click).

1. Open: https://dash.cloudflare.com/ec76ee6b6ba9798967983f0f4d7f1437/workers/onboarding  
2. Choose a subdomain (e.g. `jlm` → `jlm.workers.dev`).  
3. Run `npx.cmd wrangler deploy` again.

Your site will be at:

**https://japanese-language-mentor.&lt;your-subdomain&gt;.workers.dev**

---

## Point **japaneselanguagementor.com** here (replace Squarespace)

### A. Move DNS to Cloudflare (recommended)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Add a site** → `japaneselanguagementor.com`.  
2. Cloudflare shows two nameservers (e.g. `ada.ns.cloudflare.com`).  
3. At your **domain registrar** (or Squarespace Domains), replace nameservers with Cloudflare’s.  
4. Wait until the zone is **Active** (often 15 minutes–48 hours).

### B. Attach the domain to this Worker

**Dashboard (easiest):**

1. **Workers & Pages** → **japanese-language-mentor** → **Settings** → **Domains & Routes**.  
2. **Add** → **Custom domain** → `japaneselanguagementor.com` and `www.japaneselanguagementor.com`.  
3. Cloudflare creates DNS records automatically.

**Or wrangler.toml** (after zone is on Cloudflare):

```toml
routes = [
  { pattern = "japaneselanguagementor.com/*", zone_name = "japaneselanguagementor.com" },
  { pattern = "www.japaneselanguagementor.com/*", zone_name = "japaneselanguagementor.com" },
]
workers_dev = false
```

Then deploy again. Use `workers_dev = false` only when custom domain works, so Google doesn’t index a duplicate `.workers.dev` URL.

### C. Turn off Squarespace

- Cancel site hosting (done).  
- Remove or update any **Squarespace DNS** / domain connection so traffic goes to Cloudflare only.  
- Optional: set **www** → redirect to apex in Cloudflare **Rules**.

---

## Discord webhook → #website-inquiries (not #rules)

The Worker only uses `DISCORD_WEBHOOK_URL`. That URL is tied to whichever channel the webhook was created in.

**Fix (keep the same URL):**

1. Discord → **Server Settings** → **Integrations** → **Webhooks** → open your site webhook (e.g. Captain Hook).
2. Set **Channel** to **website-inquiries** (`1507209734095241266`) → **Save**.

**Or create a new webhook:**

1. Open **#website-inquiries** → **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook** → copy URL.
2. Local: paste into `.dev.vars` as `DISCORD_WEBHOOK_URL`.
3. Production:

```powershell
npx.cmd wrangler secret put DISCORD_WEBHOOK_URL
```

Paste the new webhook URL when prompted, then `npx.cmd wrangler deploy`.

`DISCORD_CHANNEL_ID` in `wrangler.toml` blocks contact/promo until the webhook channel matches (avoids silent misdelivery).

---

## Rotate Discord webhook (if it was ever shared in chat)

```powershell
npx.cmd wrangler secret put DISCORD_WEBHOOK_URL
```

Paste the new webhook URL when prompted (not stored in the repo).

---

## Checklist

| Step | Status |
|------|--------|
| Logged into Cloudflare (`wrangler whoami`) | Done |
| `DISCORD_WEBHOOK_URL` secret on Worker | Done |
| Register workers.dev subdomain | **You** — one dashboard click |
| `npx.cmd wrangler deploy` | Run after subdomain |
| Domain on Cloudflare + custom domain on Worker | **You** — DNS cutover |
| Test contact form + promo on live URL | After deploy |

---

## Troubleshooting

- **PowerShell blocks `npx`:** use `npx.cmd wrangler deploy`  
- **Contact form 503:** webhook missing, wrong channel, or bad URL — see **Discord webhook → #website-inquiries** above; check Worker logs for `Discord webhook is not pointed at`  
- **Old Squarespace still shows:** DNS cache — wait or flush; confirm nameservers point to Cloudflare
