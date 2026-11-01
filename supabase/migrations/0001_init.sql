-- House & Home Inspector Portal — initial database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.
--
-- Design notes
-- * The portal's server talks to the database with the secret key, which
--   bypasses row-level security. All writes go through the server.
-- * Row-level security (RLS) below controls what a signed-in user can READ
--   directly from the browser: admins see everything, company owners see
--   their company, inspectors see their own submissions.
-- * Photos and generated letters stay in Google Drive; the database keeps
--   the Drive IDs and links.

-- ───────────────────────── Types ─────────────────────────
create type public.user_role as enum ('admin', 'company_owner', 'inspector');

create type public.submission_status as enum (
  'on_hold',        -- payment failed or photos still uploading
  'submitted',      -- paid and waiting for Ron
  'under_review',   -- Ron is working on it
  'certified',      -- Ron signed it
  'delivered',      -- report sent to the client / company
  'canceled'
);

create type public.payment_status as enum ('unpaid', 'processing', 'paid', 'failed', 'refunded', 'waived');
create type public.payment_method as enum ('ach', 'card', 'isn', 'manual');

-- ───────────────────────── Companies ─────────────────────────
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  phone               text,
  email               text,
  billing_contact     text,
  billing_address     text,
  billing_city        text,
  billing_state       text default 'AZ',
  billing_zip         text,
  logo_drive_file_id  text,
  is_internal         boolean not null default false,   -- House & Home itself: never charged
  stripe_customer_id  text unique,
  default_payment     public.payment_method,             -- 'ach' preferred, 'card' fallback
  price_cents         integer not null default 13500,    -- per-submission price for this company
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ───────────────────────── People ─────────────────────────
-- One row per signed-in user (created automatically when someone is invited).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  role        public.user_role not null default 'inspector',
  company_id  uuid references public.companies (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_company_idx on public.profiles (company_id);

-- ───────────────────────── Submissions ─────────────────────────
create sequence public.submission_ref_seq start 1001;

create table public.submissions (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique default ('HH-' || nextval('public.submission_ref_seq')),
  company_id        uuid references public.companies (id) on delete set null,
  inspector_id      uuid references public.profiles (id) on delete set null,
  status            public.submission_status not null default 'on_hold',
  is_demo           boolean not null default false,

  -- Key fields pulled out of the report for lists, search and statements
  inspection_date   date,
  property_address  text,
  client_name       text,
  inspector_name    text,
  inspection_type   text,
  send_report_to    text,

  report            jsonb not null default '{}'::jsonb,   -- the full checklist as submitted
  photo_count       integer not null default 0,

  drive_folder_id   text,
  drive_link        text,
  letter_doc_id     text,

  amount_cents      integer not null default 0,
  payment_status    public.payment_status not null default 'unpaid',
  paid_at           timestamptz,

  submitted_at      timestamptz not null default now(),
  certified_at      timestamptz,
  delivered_at      timestamptz,
  updated_at        timestamptz not null default now()
);
create index submissions_company_idx   on public.submissions (company_id, submitted_at desc);
create index submissions_inspector_idx on public.submissions (inspector_id, submitted_at desc);
create index submissions_status_idx    on public.submissions (status);

-- ───────────────────────── Payments ─────────────────────────
create table public.payments (
  id                        uuid primary key default gen_random_uuid(),
  submission_id             uuid references public.submissions (id) on delete set null,
  company_id                uuid references public.companies (id) on delete set null,
  amount_cents              integer not null,
  method                    public.payment_method not null,
  status                    public.payment_status not null default 'processing',
  stripe_payment_intent_id  text unique,
  failure_reason            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index payments_company_idx on public.payments (company_id, created_at desc);

-- ───────────────────────── Keep updated_at current ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger companies_touch   before update on public.companies   for each row execute function public.touch_updated_at();
create trigger profiles_touch    before update on public.profiles    for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions for each row execute function public.touch_updated_at();
create trigger payments_touch    before update on public.payments    for each row execute function public.touch_updated_at();

-- ───────────────────────── New user → profile ─────────────────────────
-- Every new sign-in account gets a plain 'inspector' profile with no company.
-- The portal's server (secret key) then sets the real role and company when it
-- sends the invite. Nothing a user types can make themselves an admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Helpers for access rules ─────────────────────────
create or replace function public.current_role_name()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select company_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and active), false)
$$;

-- Users can't change their own role or company, even if a future policy lets
-- them edit their profile (name/phone).
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.company_id is distinct from old.company_id
          or new.active is distinct from old.active) then
    raise exception 'Only an admin can change role, company or active status';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.companies   enable row level security;
alter table public.profiles    enable row level security;
alter table public.submissions enable row level security;
alter table public.payments    enable row level security;

-- Companies: admins see all; members see their own company.
create policy companies_read on public.companies for select to authenticated
  using (public.is_admin() or id = public.current_company_id());

-- Profiles: everyone sees themselves; owners see their company's people; admins see all.
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.current_role_name() = 'company_owner' and company_id = public.current_company_id())
  );

-- People may edit their own name and phone (role/company are guarded above).
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Submissions: admins all; owners their company's; inspectors their own. Demo rows only for admins.
create policy submissions_read on public.submissions for select to authenticated
  using (
    public.is_admin()
    or (not is_demo and public.current_role_name() = 'company_owner' and company_id = public.current_company_id())
    or (not is_demo and inspector_id = auth.uid())
  );

-- Payments: admins all; owners their company's.
create policy payments_read on public.payments for select to authenticated
  using (
    public.is_admin()
    or (public.current_role_name() = 'company_owner' and company_id = public.current_company_id())
  );

-- ───────────────────────── Monthly statement view ─────────────────────────
-- One row per company per month: activity count, amount, what was paid.
create or replace view public.monthly_activity
with (security_invoker = true) as
select
  s.company_id,
  date_trunc('month', coalesce(s.inspection_date::timestamptz, s.submitted_at))::date as month,
  count(*)                                                        as submissions,
  sum(s.amount_cents)                                             as amount_cents,
  sum(case when s.payment_status = 'paid' then s.amount_cents else 0 end) as paid_cents,
  sum(case when s.payment_status in ('unpaid', 'failed') then s.amount_cents else 0 end) as balance_cents
from public.submissions s
where not s.is_demo and s.status <> 'canceled'
group by 1, 2;

-- ───────────────────────── Starting data ─────────────────────────
insert into public.companies (name, phone, email, is_internal, price_cents)
values ('House and Home AZ Inspection Service', '520-245-7897', 'houseandhomeengineering@gmail.com', true, 0)
on conflict (name) do nothing;
