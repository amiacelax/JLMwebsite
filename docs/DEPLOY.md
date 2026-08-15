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

## Homework submit → Discord (`#homework-submissions`)

Students **Submit homework** posts to a **separate** webhook from the contact form.

1. In Discord, open the homework channel (`DISCORD_HOMEWORK_CHANNEL_ID` in `wrangler.toml`, default `1507650471836258404`).
2. **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook** → copy URL.
3. Local: add to `.dev.vars` as `DISCORD_HOMEWORK_WEBHOOK_URL=...`
4. Production:

```powershell
npx.cmd wrangler secret put DISCORD_HOMEWORK_WEBHOOK_URL
```

Paste the homework-channel webhook URL, then redeploy. If this secret is missing, students see a “not set up on the server” error (answers still stay in browser localStorage).

---

## Student Discord DMs (publish + review ready)

When homework is **published** or a submission is marked **reviewed**, the Worker DMs the student on Discord (bot). If the student has no Discord user ID in Student info, it DMs JD instead. If the bot secrets are missing, it falls back to the homework webhook channel.

1. Discord Developer Portal → create a Bot → copy token.
2. Invite the bot to the JLM server (students need DMs from server members allowed, or an open DM path with the bot).
3. Production secrets:

```powershell
npx.cmd wrangler secret put DISCORD_BOT_TOKEN
npx.cmd wrangler secret put DISCORD_TEACHER_USER_ID
```

`DISCORD_TEACHER_USER_ID` is JD’s Discord snowflake (Developer Mode → right-click your profile → **Copy User ID**).

4. Local: add both to `.dev.vars` (see `.dev.vars.example`).
5. Teacher Hub → Student info → paste each student’s Discord user ID → Save.
6. **Health check** (no homework publish needed): Teacher Hub → Student info → **Check Discord bot**, or:

```powershell
curl.exe "https://japaneselanguagementor.com/api/discord-bot-status?teacherUsername=jlm"
```

Expect `"ok": true` and a `botUsername`. If you see **401**, reset the token in the Developer Portal and run `secret put` again (paste only the token — never into chat).

Without `DISCORD_BOT_TOKEN` / `DISCORD_TEACHER_USER_ID`, publish and review still succeed; notify falls back to `DISCORD_HOMEWORK_WEBHOOK_URL` (or site webhook).

---

## Contact / promo → Gmail (Resend)

Website contact + promo signup still post to Discord. The Worker also emails a copy to Gmail so you can **Reply** to the visitor.

**Why Resend (not Gmail SMTP / Cloudflare Email Routing):** Workers need an HTTPS transactional API. Resend free tier (3,000/mo) is enough for inquiries. Gmail is the *inbox*, not the sender.

1. Sign up at [resend.com](https://resend.com) (free).
2. **Domains** → add `japaneselanguagementor.com` → add the DNS records Resend shows (SPF / DKIM; often MX for receiving if you enable inbound — sending only needs what they list).
3. Wait until the domain shows **Verified**.
4. **API Keys** → create a key (Sending access is enough).
5. Production secret (paste when prompted — never commit):

```powershell
cd "C:\JLM Website"
npx.cmd wrangler secret put RESEND_API_KEY
```

6. Optional: confirm From/To in `wrangler.toml` `[vars]`:
   - `INQUIRY_EMAIL_TO` = `languagementor.jp@gmail.com`
   - `INQUIRY_EMAIL_FROM` = `Japanese Language Mentor <inquiries@japaneselanguagementor.com>`
7. Redeploy if you haven’t since this feature shipped (`npm run deploy`).
8. Test the homepage contact form — you should get Discord **and** a Gmail message. Hit **Reply** → goes to the visitor (`Reply-To`).

Until `RESEND_API_KEY` is set, contact/promo keep working via Discord only (Worker logs that email was skipped).

**Quick test without custom domain:** Resend allows `from: onboarding@resend.dev` only to your Resend account email. Set temporarily:

```powershell
# after verifying you can receive at that address — then switch back to inquiries@…
```

Prefer verifying `japaneselanguagementor.com` before relying on production From.

---

## PayPal return URL (homework plans)

So students land back on the hub after paying (`?paid=1&plan=basic` etc.):

1. Create / open a **Live** REST app: [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/live)
2. Copy **Client ID** and **Secret**
3. Set Worker secrets (paste when prompted — never commit):

```powershell
cd "C:\JLM Website"
npx.cmd wrangler secret put PAYPAL_CLIENT_ID
npx.cmd wrangler secret put PAYPAL_CLIENT_SECRET
```

4. Redeploy once (`npm run deploy`) so the new code path is live if you haven’t already
5. Test: pick a plan while logged in → same tab opens PayPal → after approve you return to `/homework/platform.html?paid=1&plan=…` and the waiting screen

Without those secrets, checkout still works via the plain PayPal subscribe link; students use **I’ve paid — continue** when they come back.

**Webhooks** (auto unlock/cancel from PayPal events): defer until ~10 paying subscribers.

---

## Checklist

| Step | Status |
|------|--------|
| Logged into Cloudflare (`wrangler whoami`) | Done |
| `DISCORD_WEBHOOK_URL` secret on Worker | Done |
| `DISCORD_HOMEWORK_WEBHOOK_URL` secret on Worker | **Required for homework submit** |
| `DISCORD_BOT_TOKEN` + `DISCORD_TEACHER_USER_ID` | **Required for student/teacher DMs** (else webhook fallback) |
| Register workers.dev subdomain | **You** — one dashboard click |
| `npx.cmd wrangler deploy` | Run after subdomain |
| Domain on Cloudflare + custom domain on Worker | **You** — DNS cutover |
| Test contact form + promo on live URL | After deploy |
| Test homework submit as student on live URL | After homework webhook secret |

---

## Troubleshooting

- **PowerShell blocks `npx`:** use `npx.cmd wrangler deploy`  
- **Contact form 503:** webhook missing, wrong channel, or bad URL — see **Discord webhook → #website-inquiries** above; check Worker logs for `Discord webhook is not pointed at`  
- **Publish OK but “student DM failed — bot token unauthorized (401)”:** homework saved; Discord rejected the bot login. Reset the token in [Discord Developer Portal](https://discord.com/developers/applications) → your app → **Bot** → **Reset Token**, then `npx.cmd wrangler secret put DISCORD_BOT_TOKEN` (paste only the token, no `Bot ` prefix). Do not paste the token into chat. Redeploy is not required after `secret put` alone on Workers, but run `npx.cmd wrangler deploy` if unsure. Confirm secret exists with `npx.cmd wrangler secret list` (names only).  
- **Old Squarespace still shows:** DNS cache — wait or flush; confirm nameservers point to Cloudflare

### Wrangler `Authentication error [code: 10000]` / `Failed to retrieve account IDs`

Wrangler is not authorized for the Cloudflare account that owns this Worker (`account_id` is in `wrangler.toml`).

**Fix A — re-login (most common):**

```powershell
cd "C:\JLM Website"
npx.cmd wrangler logout
npx.cmd wrangler login
npx.cmd wrangler whoami
```

Use the browser login for **languagementor.jp@gmail.com** (same account as deploy docs). Then retry `wrangler secret put`.

**Fix B — set secrets in the dashboard (no CLI):**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/ec76ee6b6ba9798967983f0f4d7f1437) → **Workers & Pages** → **japanese-language-mentor**
2. **Settings** → **Variables and Secrets** → **Add** → **Secret**
3. Name: `DISCORD_HOMEWORK_WEBHOOK_URL`, value: your homework-channel Discord webhook URL → **Encrypt**
4. **Deploy the Worker** after adding or changing secrets (dashboard: **Workers & Pages** → **japanese-language-mentor** → **Deployments** → **Deploy** / connect Git, or `npx.cmd wrangler deploy`). Until deploy, new secrets may not apply to the live script.
5. Test student submit on the live site.

**Fix C — API token:** If you use `CLOUDFLARE_API_TOKEN` instead of OAuth, create a token with **Workers Scripts Edit** (and **Account** read). Do not commit the token.
