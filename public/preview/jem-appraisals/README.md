# JEM Appraisals Website

A simple, single-page static site for JEM Appraisals — real estate appraiser in Deale, Maryland.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main page (all content lives here) |
| `styles.css` | Layout and colors |
| `assets/logo.svg` | Header logo |
| `assets/photo.jpg` | Your dad's photo (add this file) |
| `assets/photo-placeholder.svg` | Shown until `photo.jpg` exists |
| `favicon.svg` | Browser tab icon |
| `robots.txt` / `sitemap.xml` | Search engines |
| `OFFSITE-SEO-CHECKLIST.md` | Google Business Profile and other steps |

## Add or replace the photo

1. Save the image as **`assets/photo.jpg`** (JPEG recommended).
2. Refresh the site — no code changes needed.
3. For a better photo later, overwrite the same file.

Optional: update the `alt` text in `index.html` if you want a more specific description.

## Edit copy

Open `index.html` in any text editor. Section headings use `id` attributes (`about`, `services`, `contact`, etc.) for easy navigation.

## Deploy free on Netlify

### Option A — Drag and drop (fastest)

1. Go to [https://app.netlify.com](https://app.netlify.com) and sign up (free).
2. Drag this entire folder onto the Netlify dashboard.
3. Netlify gives you a URL like `https://random-name.netlify.app`.
4. In **Site settings → Domain management → Options → Edit site name**, set something like **`jem-appraisals`** so the URL becomes `https://jem-appraisals.netlify.app`.

### Option B — GitHub + Netlify

1. Create a new GitHub repository and push this folder.
2. In Netlify: **Add new site → Import from Git** → select the repo.
3. Build settings: leave build command empty; publish directory = `.` (root).

### After deploy — update SEO URLs

Replace `https://jem-appraisals.netlify.app` with your real Netlify URL in:

- `index.html` — `canonical`, Open Graph `og:url`, and JSON-LD `url`
- `robots.txt` — `Sitemap:` line
- `sitemap.xml` — `<loc>` URL

Then redeploy.

## Add a custom domain later

1. Buy a domain (e.g. `jemappraisals.com`).
2. In Netlify: **Domain management → Add custom domain** and follow DNS instructions.
3. Update the same URLs in `index.html`, `robots.txt`, and `sitemap.xml`.

## Local preview

Open `index.html` in a browser, or run a simple server:

```powershell
cd "c:\JEM Website"
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Off-site visibility

See **`OFFSITE-SEO-CHECKLIST.md`** — Google Business Profile is often the biggest source of calls for a new local business site.
