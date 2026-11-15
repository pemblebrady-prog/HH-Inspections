-- House & Home Inspector Portal - final letter delivery
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001-0004).

alter table public.submissions
  add column if not exists final_pdf_id   text,     -- Drive file id of the sent PDF
  add column if not exists final_pdf_link text,
  add column if not exists delivered_to   text[];   -- who it was emailed to
