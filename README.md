# House & Home Inspector Portal

The portal for manufactured home foundation certifications, certified by Ron Rath PE. Lenders request an
inspection on a web form, the office schedules and assigns it, the inspector submits the checklist, sketch and
photos from their phone, the company is charged, Ron reviews a draft letter written in his format, and the signed
report is emailed as a PDF.

- **Live:** https://hh-inspections.vercel.app
- **Branch previews:** `https://hh-inspections-git-<branch>-brady-pemble-s-projects.vercel.app`
  (behind Vercel's login while Deployment Protection is on)
- **Setup check:** `/api/health` lists which settings the server can see (true/false only, never values)
- **Punch list:** https://claude.ai/artifact/WdRKGZQ9SDEZRNYyr4tThr

## How it works

1. **Request** (`/request`, public, not linked anywhere yet). The same questions as the old website form: type of
   inspection, requester, home address and occupants, report copies, gates/dogs/lockbox. Creates an order
   (`OR-1001`…), emails the office (`ORDER_ALERT_EMAILS`) and a confirmation to the requester. Lockbox codes stay
   in the portal, never in email.
2. **Schedule** (`/admin/orders`). The office sets the date, assigns an inspector (they get an email) and can add
   the ISN order number. The inspector sees it on their home screen and taps **Start the job** for a pre-filled form.
3. **Invite.** Admins invite people on **People** (`/admin/people`) or straight from a company's page
   (`/admin/companies/<id>`). Company owners invite their own inspectors on **My team** (`/team`). No self sign-up.
4. **Sign in.** Email + one-time code (`/login`), sent by email.
5. **First-time setup** (`/welcome`). Inspectors: name, phone, AZ certificate #, report email, add to home screen.
   Company owners also add company details, logo and a payment method (ACH preferred, card fallback).
6. **Submit** (`/`). Desktop form or phone wizard (all photo sections on one scrolling page). Photos are shrunk,
   checked for blur/darkness on the phone, and start uploading in the background; the form autosaves.
   A one-mile GPS check warns if the inspector isn't at the address. The home sketch can be drawn in the portal
   (home to scale, porches/carports/additions, Ron's letter tags). Claude reads the HUD tag and data plate photos
   and warns about photos in the wrong section (needs `ANTHROPIC_API_KEY`).
7. **Finalize** (`/api/submit/finalize`). Records the photos, charges the company (saved method, or a pay-by-card
   link for pay-as-you-go companies), emails the office and inspector, and builds the draft letter as a Google Doc.
8. **Review** (`/admin/review`, refreshes every 15 minutes). Ron's queue: checklist, photos, sketch, letter
   preview, notes. He checks the Google Doc, clicks **Mark certified**, then **Send final letter**, which exports
   the PDF, saves it to Drive and emails it to the requester, report copies, company owners and inspector.
   Sending is only possible once a job is marked certified.
9. **Track.** Inspectors and owners see their jobs and PDFs on **My jobs** (`/jobs`); owners see charges and monthly
   activity statements on **Billing** (`/billing`). Admins have **Reports** (`/admin/reports`, CSV export).

Job status: `uploading → submitted (Needs review) → under_review → certified → delivered`, plus `on_hold` (payment
failed or waiting on a pay-by-card payment) and `canceled`.

Roles: **admin** (House & Home staff, sees everything; can "view as" any user), **engineer** (Ron: review queue and
his PE details), **company_owner** (their company's jobs, team, billing), **inspector** (submit + their own jobs).
Enforced in middleware, in each page/route, and by row-level security.

## Admin pages (☰ menu)

| Page | What it's for |
|---|---|
| Orders | Incoming requests: schedule, assign, ISN #, notes |
| Review queue | Jobs waiting for Ron; job page has letter, certify, send, payment actions |
| People | Invite, change roles, deactivate |
| Companies | Default price, each company's custom price, on/off, pay-as-you-go, details, logo, rename, invite, jobs, statements |
| Engineers / My PE details | Name, license # and expiry (warnings at 60/30/7 days), stamp and signature images |
| Statements, Reports | Monthly activity statements; job and revenue reports with CSV |
| Google & email | Connect Gmail (sends all portal email) and Google Drive (stores everything); send a test email |

## Services

| Service | Used for | Notes |
|---|---|---|
| Vercel | Hosting, previews per branch, daily/monthly cron | Env vars must be ticked for **Preview** too; redeploy after changing them |
| Supabase | Sign-in + Postgres database | Invite-only; run every file in `supabase/migrations` in order |
| Google Drive | Job folders, photos, letters, final PDFs, logos, stamps | Connected on Admin → Google & email; everything lives in one "House & Home Portal" folder |
| Gmail | All email (codes, invites, alerts, receipts, final reports) | Connected on Admin → Google & email (send-only permission). Resend is only a fallback |
| Stripe | Saved bank account / card, charge per job, pay-by-card links | Test keys on Preview; live keys on Production once the business is verified |
| Anthropic | Photo checks, HUD tag / data plate reading | Optional; without it only the on-phone blur/dark checks run |

## Setup

### 1. Supabase
1. Create a project, then in **SQL Editor** run each file in `supabase/migrations/` in order (`0001` … `0015`).
2. **Authentication → Sign In / Providers:** Email on; turn **off** "Allow new users to sign up". Email OTP length 6–8.
3. **Authentication → URL Configuration:** Site URL = production URL; Redirect URLs include
   `https://hh-inspections.vercel.app/**` and `https://*-brady-pemble-s-projects.vercel.app/**`.
4. Add yourself (**Authentication → Users → Add user**, Auto Confirm on) and make yourself admin:
   `update public.profiles set role = 'admin', onboarded_at = now() where email = 'you@example.com';`
   Adding someone this way sends no email; inviting from the portal sends a welcome email.

### 2. Google (Drive + Gmail)
1. In Google Cloud (signed in as the business account), enable the **Google Drive API** and **Gmail API**.
2. Create an OAuth client (Web application). Redirect URIs, for each site (preview and live):
   `<site>/api/google/drive/callback` and `<site>/api/google/gmail/callback`. Publish the consent screen
   ("In production") so connections don't expire after 7 days.
3. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in Vercel, redeploy.
4. In the portal: **☰ → Google & email → Connect Gmail** and **Connect Google Drive**, both as the business account.
   The connections are stored in the database (`app_secrets`), so no tokens are copied by hand. Each site (preview,
   live) connects separately. Drive permission only covers files the portal creates, so it makes its own
   "House & Home Portal" folder; it can be moved but not renamed or deleted.
- Older env-var setups (`GOOGLE_OAUTH_REFRESH_TOKEN` + `GDRIVE_ROOT_FOLDER_ID`, or a service account with
  `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`) still work as a fallback.
- Without Drive the portal runs in "simulated" mode (no files are saved).

### 3. Stripe
1. Enable **ACH Direct Debit** under Settings → Payment methods. Set the statement descriptor in the dashboard.
2. Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` (same account; test on Preview, live on Production).
3. Add a webhook at `<site>/api/stripe/webhook` for `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `setup_intent.succeeded`; set its signing secret as `STRIPE_WEBHOOK_SECRET`. Test and live each need their own.

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key (safe in the browser) |
| `SUPABASE_SECRET_KEY` | yes | Supabase secret key (server only, mark Sensitive) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | yes | Google sign-in for Connect Drive / Gmail |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for payments | Stripe |
| `STRIPE_STATEMENT_PREFIX` | no | Short text on card statements (default `H&H AZ`) |
| `CRON_SECRET` | yes | Protects the daily and monthly cron jobs |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | no | Photo checks and tag reading |
| `ORDER_ALERT_EMAILS` | no | Who gets new inspection requests (else `REVIEW_ALERT_EMAILS`, else all admins) |
| `REVIEW_ALERT_EMAILS` | no | Who gets new-job alerts (default: all active admins) |
| `EMAIL_FROM_NAME` | no | Sender name on Gmail (default "House & Home Inspections") |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Fallback email when Gmail isn't connected |
| `PAYMENT_REQUIRED` | no | `true` = jobs from companies with no payment method go on hold |
| `NEXT_PUBLIC_CERT_FEE` | no | Fallback fee in dollars before the default price is set (default 135) |
| `GF_*`, `ORDER_INTAKE_SECRET` | no | Old Gravity Forms import, no longer used; can be removed |

### Cron (vercel.json)
- `/api/cron/daily` (15:41 UTC): PE license expiry warnings; deletes unclaimed early uploads after 14 days.
- `/api/cron/statements` (1st of the month): emails monthly activity statements.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```
Without Supabase settings, sign-in is switched off and the form works on its own (simulated mode).

## Demo mode
Add `?demo=1` to the portal URL for a **Fill sample data** button. Demo jobs go to a `_Demo Submissions` Drive
folder, are never charged, and are hidden from queues by default. Sample photos live in `public/demo/<slot>.jpg`.

## Changing things
- **Letter wording:** `lib/letterContent.js` (paragraphs, CFR sentences, contractors, pass statement, House & Home
  name/phone). Layout: `lib/letterTemplate.js`.
- **Form questions and photo sections:** `lib/formConfig.js`. Request form options: `lib/requestOptions.js`.
- **Email wording:** `lib/emailTemplates.js`, `lib/requestIntake.js`, `lib/delivery.js`.
- **Office phone:** 520-599-7798, in `lib/letterContent.js`, `app/LegalPage.js` and the email/request files above.

## File map

```
app/
  page.js, PortalPage.js        submission form (server gate + client page)
  DesktopForm.js, MobileWizard.js, PhotoSlot.js, useSubmissionForm.js
  SketchBuilder.js, SketchLauncher.js    home sketch editor
  TagFinding.js, NearJobCheck.js, AssignedOrders.js, UploadStatus.js, TopNotices.js
  AppHeader.js, UserMenu.js, ViewAs.js   shared top bar (☰ menu, view-as)
  request/                      public inspection request form + thank-you page
  login/, welcome/, jobs/, team/, billing/, pay/[ref], statement/, privacy/, terms/
  admin/orders, admin/review, admin/people, admin/companies, admin/engineer,
  admin/statements, admin/reports, admin/email
  tracker/                      older Drive-based tracker (admins only)
  api/
    auth/send-code, auth/verify-code    sign-in codes
    requests, orders/*                  request form intake; orders, prefill, distance check
    submit, submit/finalize, upload, upload/early, upload/claim   jobs and photos
    photos/check                        Claude photo checks
    admin/*                             people, companies, submissions (review actions), engineer,
                                        orders, reports, statements, email, settings
    google/drive/*, google/gmail/*      Connect Drive / Gmail
    pay/[ref], billing/*, stripe/webhook   payments
    cron/daily, cron/statements, health, logo, jobs/report, view-as, team, me
lib/
  supabase/                     clients + requireUser / getCurrentProfile
  drive.js, gmail.js, email.js  Google Drive, Gmail sending (Resend fallback)
  letters.js, letterContent.js, letterTemplate.js, letterRecord.js, delivery.js
  stripe.js, charges.js, billing.js, payPerJob.js, pricing.js, statementText.js
  companyAdmin.js, engineers.js, licenseWarnings.js, roles.js, viewAs.js
  orders.js, requestIntake.js, requestOptions.js, geo.js
  photoAI.js, photoQuality.js, staging.js, earlyUpload.js, offlineStore.js, uploadQueue.js
  activityStatement.js, sendStatements.js, reports.js, alerts.js, invite.js, emailTemplates.js
middleware.js                   session refresh + sign-in gate
supabase/migrations/            database schema, run in order (0001–0015)
public/                         icons, manifest, demo photos
```
