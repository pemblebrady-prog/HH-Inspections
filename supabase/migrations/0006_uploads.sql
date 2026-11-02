-- House & Home Inspector Portal - reliable uploads
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001-0005).

-- New status while photos are still coming in from the inspector's phone.
alter type public.submission_status add value if not exists 'uploading' before 'on_hold';

-- The phone's own id for a submission, so retries never create duplicates.
alter table public.submissions add column if not exists client_id text;
create unique index if not exists submissions_client_id_key on public.submissions (client_id) where client_id is not null;
