-- House & Home Inspector Portal - review queue
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001 and 0002).

-- Uploaded photo IDs (so the letter can be regenerated) and the draft letter link.
alter table public.submissions
  add column if not exists photos        jsonb not null default '[]'::jsonb,
  add column if not exists letter_link   text,
  add column if not exists review_notes  text,
  add column if not exists reviewed_by   uuid references public.profiles (id) on delete set null;
