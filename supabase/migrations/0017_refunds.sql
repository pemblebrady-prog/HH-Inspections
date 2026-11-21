-- 0017: Refunds (full or partial), from the portal or straight in Stripe (Brian, Nov 19).
-- Paste into Supabase -> SQL Editor -> New query -> Run.

alter table public.submissions add column if not exists refunded_cents integer not null default 0;
alter table public.payments    add column if not exists refunded_cents integer not null default 0;

create table if not exists public.refunds (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid references public.submissions (id) on delete set null,
  payment_id       uuid references public.payments (id) on delete set null,
  company_id       uuid references public.companies (id) on delete set null,
  amount_cents     integer not null check (amount_cents > 0),
  reason           text,
  status           text not null default 'succeeded',  -- Stripe refund status: pending, succeeded, failed, canceled
  stripe_refund_id text unique,
  created_by       uuid references public.profiles (id) on delete set null,
  source           text not null default 'portal',     -- 'portal' or 'stripe' (made in the Stripe dashboard)
  emailed_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists refunds_submission_idx on public.refunds (submission_id, created_at);
alter table public.refunds enable row level security;

drop policy if exists refunds_read on public.refunds;
create policy refunds_read on public.refunds for select to authenticated
  using (public.is_admin() or (public.is_company_manager() and company_id = public.current_company_id()));

-- Monthly statement view: what was paid, less refunds.
create or replace view public.monthly_activity
with (security_invoker = true) as
select
  s.company_id,
  date_trunc('month', coalesce(s.inspection_date::timestamptz, s.submitted_at))::date as month,
  count(*)                                                        as submissions,
  sum(s.amount_cents)                                             as amount_cents,
  sum(case when s.payment_status in ('paid', 'refunded') then s.amount_cents - s.refunded_cents else 0 end) as paid_cents,
  sum(case when s.payment_status in ('unpaid', 'failed') then s.amount_cents else 0 end) as balance_cents
from public.submissions s
where not s.is_demo and s.status <> 'canceled'
group by 1, 2;
