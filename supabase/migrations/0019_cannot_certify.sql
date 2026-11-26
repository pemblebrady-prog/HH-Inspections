-- House & Home Inspector Portal - "Cannot certify" (Nov 25)
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001-0018).

-- The engineer can't certify the home no matter what's fixed: the office refunds the customer and closes it.
alter type public.submission_status add value if not exists 'cannot_certify' after 'corrections';

alter table public.submissions add column if not exists cannot_certify_reason text;
alter table public.submissions add column if not exists cannot_certify_at timestamptz;
alter table public.submissions add column if not exists cannot_certify_by uuid references public.profiles (id) on delete set null;
