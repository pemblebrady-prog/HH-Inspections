-- House & Home Inspector Portal - onboarding fields
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001).

-- Inspector details collected on first sign-in
alter table public.profiles
  add column if not exists certificate_number   text,
  add column if not exists default_report_email text,
  add column if not exists onboarded_at         timestamptz;

-- Company setup finished by the company owner
alter table public.companies
  add column if not exists onboarded_at timestamptz;

-- Admins and anyone already set up skip the welcome screens.
update public.profiles set onboarded_at = now() where role = 'admin' and onboarded_at is null;
update public.companies set onboarded_at = now() where is_internal and onboarded_at is null;
