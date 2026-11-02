# House & Home Inspector Portal

The portal for manufactured home foundation certifications. Inspectors submit the
checklist and photos from their phone, the company is charged automatically, Ron
reviews a draft letter written in his format, and the signed report is emailed
as a PDF.

- **Live:** https://hh-inspections.vercel.app
- **Branch previews:** `https://hh-inspections-git-<branch>-brady-pemble-s-projects.vercel.app`
- **Setup check:** `/api/health` lists which settings the server can see (true/false only, never values)

## How it works

1. **Invite.** An admin invites people on **People** (`/admin/people`). Company owners can invite their own
   inspectors on **My team** (`/team`). There is no self sign-up.
2. **Sign in.** Email + one-time code (`/login`). The portal asks Supabase for the code and emails it through Resend.
3. **First-time setup** (`/welcome`). Inspectors: name, phone, AZ certificate #, default report email, add to
   home screen. Company owners also add company details + letterhead logo, a payment method (ACH preferred, card
   fallback) and their inspectors.
4. **Submit** (`/`). Desktop form or phone wizard. Photos are shrunk and saved on the phone as they're taken; the
   form autosaves. On submit, a queue creates the job once, uploads each photo with retries (waiting for signal
   when offline, resuming when the app reopens), then **finalizes**.
5. **Finalize** (`/api/submit/finalize`). Records the photos, charges the company's saved payment method (Stripe),
   emails the office and the inspector, and builds the draft certification letter as a Google Doc.
6. **Review** (`/admin/review`). Ron's queue: checklist, photos, letter preview, notes. He edits and stamps the
   Google Doc, then **Send final letter** exports it to PDF, saves it to Drive, emails it to the report recipient,
   company owners and inspector, and marks the job delivered.
7. **Track.** Inspectors and owners see their jobs and download the PDF on **My jobs** (`/jobs`). Owners see
   charges on **Billing** (`/billing`).

Job status: `uploading → submitted (Needs review) → under_review → certified → delivered`, plus `on_hold` when
payment fails and `canceled`.

Roles: **admin** (House & Home staff, sees everything), **company_owner** (their company's jobs, team, billing),
**inspector** (submit + their own jobs). Enforced in middleware, in each page/route, and by row-level security.

## Services

| Service | Used for | Notes |
|---|---|---|
| Vercel | Hosting, previews per branch | Env vars must be ticked for **Preview** too; redeploy after changing them |
| Supabase | Sign-in + Postgres database | Invite-only; run every file in `supabase/migrations` in order |
| Google Drive | Job folders, photos, letter Google Docs, final PDFs, company logos | OAuth (personal Drive) or service account (Workspace Shared Drive) |
| Resend | All email (codes, invites, alerts, receipts, final reports) | Needs a verified domain to email anyone besides the account owner |
| Stripe | Saved bank account / card, charge per submission | Test mode keys on Preview; live keys on Production once the business is verified |

## Setup

### 1. Supabase
1. Create a project, then in **SQL Editor** run each file in `supabase/migrations/` in order (`0001` … `0006`).
2. **Authentication → Sign In / Providers:** Email on; turn **off** "Allow new users to sign up". Email OTP length 6–8.
3. **Authentication → URL Configuration:** Site URL = production URL; Redirect URLs include
   `https://hh-inspections.vercel.app/**` and `https://*-brady-pemble-s-projects.vercel.app/**`.
4. Invite yourself (**Authentication → Users → Add user**) and make yourself admin:
   `update public.profiles set role = 'admin', onboarded_at = now() where email = 'you@example.com';`

### 2. Google Drive
- **OAuth (personal Gmail):** create an OAuth client (scope `drive.file`), get a refresh token, and set
  `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_REFRESH_TOKEN`,
  `GDRIVE_ROOT_FOLDER_ID`.
- **Service account (Workspace Shared Drive):** add the service account to the Shared Drive as Content Manager and
  set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GDRIVE_ROOT_FOLDER_ID` instead. No code change.
- Without Drive settings the portal runs in "simulated" mode (no files are saved).

### 3. Resend
Verify the sending domain (DNS records at the domain host), create an API key, set `RESEND_API_KEY` and
`EMAIL_FROM` (e.g. `House & Home Inspections <portal@houseandhomeaz.com>`).

### 4. Stripe
1. Enable **ACH Direct Debit** under Settings → Payment methods.
2. Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` (both from the same account/sandbox).
3. Add a webhook endpoint (Your account) at `<site>/api/stripe/webhook` for `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `setup_intent.succeeded`; set its signing secret as `STRIPE_WEBHOOK_SECRET`.
   Production needs its own webhook pointing at the production URL.

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key (safe in the browser) |
| `SUPABASE_SECRET_KEY` | yes | Supabase secret key (server only, mark Sensitive) |
| `GDRIVE_ROOT_FOLDER_ID` + Google auth vars | yes | See Google Drive above |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes | Email |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for payments | Stripe |
| `REVIEW_ALERT_EMAILS` | no | Comma-separated emails for new-job alerts (default: all active admins) |
| `PAYMENT_REQUIRED` | no | `true` = jobs from companies with no payment method go on hold |
| `NEXT_PUBLIC_CERT_FEE` | no | Fallback fee in dollars when a job has no company (default 135) |

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```
Without Supabase settings, sign-in is switched off and the form works on its own (simulated mode).

## Demo mode
Add `?demo=1` to the portal URL for a **Fill sample data** button. Demo jobs go to a `_Demo Submissions` Drive
folder, are never charged, and are hidden from queues by default. Sample photos live in `public/demo/<slot>.jpg`.

## Changing the letter
All wording (standard paragraph, CFR sentences, corrections, the five contractors, pass statement, footer) is in
`lib/letterContent.js`. The layout is in `lib/letterTemplate.js`.

## File map

```
app/
  page.js, PortalPage.js        submission form (server gate + client page)
  DesktopForm.js, MobileWizard.js, PhotoSlot.js, useSubmissionForm.js
  UploadStatus.js               live upload status ("waiting for signal", retries)
  AppHeader.js, UserMenu.js     shared top bar (☰ menu, logo home, profile)
  InstallPrompt.js, HomeScreenSteps.js   add-to-home-screen pop-up + steps
  login/, welcome/, jobs/, team/, billing/
  admin/people, admin/review, admin/review/[ref]
  companies/, tracker/          older Drive-based admin pages
  api/
    auth/send-code, auth/verify-code    sign-in codes
    submit, submit/finalize, upload     job creation, photos, finalize
    letters/generate                    draft letter (Google Doc)
    admin/people, admin/submissions     invites; review actions (status, letter, charge, waive, send)
    admin/photo, logo, jobs/report      photos, logos, final PDFs (access-checked)
    billing, billing/setup, billing/confirm, stripe/webhook   payments
    team, me, me/onboarding, me/company, health
lib/
  supabase/                     clients + requireUser / getCurrentProfile
  drive.js, letters.js, letterContent.js, letterTemplate.js, delivery.js
  stripe.js, charges.js, billing.js
  offlineStore.js, uploadQueue.js       phone-side storage and upload queue
  email.js, alerts.js, invite.js, jobAccess.js, statusLabels.js
middleware.js                   session refresh + sign-in gate
supabase/migrations/            database schema, run in order
public/                         icons, manifest, demo photos
```
