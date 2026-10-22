# One-time Google setup (about 10 min)

1. Go to https://console.cloud.google.com/ (sign in with the Google account that owns the YouTube channel).
2. Top bar > project picker > **New project** > name it `JLM Uploader` > Create.
3. Left menu > **APIs & Services > Library** > search **YouTube Data API v3** > **Enable**.
4. **APIs & Services > OAuth consent screen** (or "Google Auth Platform"):
   - User type: **External** > Create.
   - App name `JLM Uploader`, your email for support + developer contact > Save.
   - Scopes: skip. Test users: **add your own Google email** > Save.
5. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Desktop app** > name `JLM Uploader` > Create.
   - Click **Download JSON**.
6. Rename the file to `client_secret.json` and put it in `C:\JLM Website\yt-lesson-uploader\`.
7. Tell Cursor "done". I run `python youtube_api.py auth` — a browser opens once, click your account > Continue (ignore "unverified app", that's you) > Allow.

Notes
- Videos uploaded by a brand-new unverified app are forced to **private** until Google audits the app.
  Fix = free audit form (YouTube API Services - Audited Client). I'll help fill it after the first upload works.
- Free quota is ~6 uploads/day.
