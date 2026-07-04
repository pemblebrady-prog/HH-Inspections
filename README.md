# House & Home — Inspector Portal

A submission portal for manufactured-home engineering certifications. Inspectors
enter the property + a foundation checklist, upload photos, "pay" the fee, and
submit. On submit, photos are filed into **Google Drive** under `Address / Date`
with a `submission.json` record.

**Stubbed:** payment always passes (no charge). Everything else is real.
If Drive isn't configured, the app runs in *simulated* mode so you can demo it.

The app supports **two Drive auth methods** and picks whichever is configured:
- **OAuth** — for a personal @gmail.com Drive (files owned by you). Use this now.
- **Service account** — for a Google Workspace **Shared Drive**. Use this later
  when the app moves to your brother's Workspace. No code change — just env vars.

---

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000  (works immediately in simulated mode)
```

## Wire Google Drive — OAuth path (personal Gmail)

1. **Cloud Console → APIs & Services → OAuth consent screen**
   - User type: **External**. Fill app name + your email.
   - **Scopes:** add `.../auth/drive.file` (the app only touches files it creates).
   - **Test users:** add your own Gmail address.
   - To avoid refresh tokens expiring after 7 days, **Publish** the app
     (Publishing status → "In production"). You'll see an "unverified app"
     warning when you authorize — that's expected for your own use; click through.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorized redirect URIs:** add `http://localhost:3000/api/google/callback`
     (and later `https://YOUR-APP.vercel.app/api/google/callback`).
   - Copy the **Client ID** and **Client secret**.
3. Copy `.env.example` to `.env.local` and fill in `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI`. Restart `npm run dev`.
4. Visit **http://localhost:3000/api/google/auth**, authorize with your Gmail.
   The callback page prints your **`GOOGLE_OAUTH_REFRESH_TOKEN`** and a
   **`GDRIVE_ROOT_FOLDER_ID`** (a folder the app just created). Paste both into
   `.env.local` and restart. Submit a test — a folder appears in your Drive.

## Deploy to Vercel

1. Push this folder to a **GitHub repo** (shared with your brother = your version control).
2. **Vercel → Add New → Project → Import** the repo → **Deploy**.
3. **Settings → Environment Variables:** add everything from `.env.local`.
   Update `GOOGLE_OAUTH_REDIRECT_URI` to your Vercel URL and add that same
   `.../api/google/callback` URL to the OAuth client's Authorized redirect URIs.
   Redeploy.

## Later: moving to your brother's Workspace (Shared Drive)

When the app lands on his side and he has Workspace:
1. Create a **Shared Drive**, add the service account email as **Content Manager**.
2. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and
   `GDRIVE_ROOT_FOLDER_ID` (a folder in that Shared Drive). Remove the OAuth vars.
The code auto-detects and uses the service account. Nothing else changes.

---

## Not built yet
- **Real payments** (Stripe on step 3, replacing the stub).
- **Inspector logins + tracking dashboard** (scheduled / under review / certified / paid).
- **Auto-drafted certification letter** from checklist + photos.

## File map
```
app/page.js                    the multi-step form (client)
app/api/submit/route.js        creates Address/Date folder + metadata
app/api/upload/route.js        uploads one compressed photo
app/api/google/auth/route.js   one-time: start OAuth consent
app/api/google/callback/route.js one-time: prints refresh token + folder id
lib/drive.js                   Drive helpers (OAuth or service account)
```
