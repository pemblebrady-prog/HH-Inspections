-- House & Home Inspector Portal - failed inspections: corrections letter, follow-up, clear letter
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001-0017).

-- A job waiting for corrections (the corrections letter went out; waiting for the fix and new photos).
alter type public.submission_status add value if not exists 'corrections' after 'under_review';

-- One row per corrections round on a job: the corrections letter, then the follow-up
-- (new photos from the inspector, or a House & Home re-inspection), then Ron clears it or asks again.
create table if not exists public.correction_rounds (
  id                    uuid primary key default gen_random_uuid(),
  submission_id         uuid not null references public.submissions (id) on delete cascade,
  round                 integer not null default 1,
  -- draft: letter being prepared · waiting: letter sent, waiting for the follow-up ·
  -- awaiting_payment: follow-up in, waiting for the card fee · submitted: follow-up in, with the engineer ·
  -- cleared: clear letter made · redo: another corrections letter was needed · canceled
  status                text not null default 'draft'
                        check (status in ('draft', 'waiting', 'awaiting_payment', 'submitted', 'cleared', 'redo', 'canceled')),
  corrections           jsonb not null default '[]'::jsonb,          -- ["Tie-downs need to be installed ...", ...]
  followup_by           text not null default 'inspector' check (followup_by in ('inspector', 'house_and_home')),
  assigned_to           uuid references public.profiles (id) on delete set null,
  fee_cents             integer not null default 0 check (fee_cents >= 0),
  fee_status            text not null default 'none'
                        check (fee_status in ('none', 'unpaid', 'processing', 'paid', 'failed', 'waived')),
  -- the corrections letter
  engineer_id           uuid references public.profiles (id) on delete set null,   -- whose name and stamp it carries
  letter_doc_id         text,
  letter_link           text,
  pdf_id                text,
  pdf_link              text,
  sent_at               timestamptz,
  sent_to               text[],
  sent_by               uuid references public.profiles (id) on delete set null,
  -- the follow-up
  followup_items        jsonb not null default '[]'::jsonb,          -- [{ correction, note, photos: [{ id, label }] }]
  followup_photos       jsonb not null default '[]'::jsonb,          -- every follow-up photo: [{ id, label, slot }]
  followup_notes        text,
  reinspection_date     date,
  followup_submitted_at timestamptz,
  followup_submitted_by uuid references public.profiles (id) on delete set null,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (submission_id, round)
);
create index if not exists correction_rounds_assigned_idx on public.correction_rounds (assigned_to, status);
create index if not exists correction_rounds_status_idx on public.correction_rounds (status);

drop trigger if exists correction_rounds_touch on public.correction_rounds;
create trigger correction_rounds_touch before update on public.correction_rounds
  for each row execute function public.touch_updated_at();

alter table public.correction_rounds enable row level security;
drop policy if exists correction_rounds_read on public.correction_rounds;
create policy correction_rounds_read on public.correction_rounds for select to authenticated
  using (
    public.is_admin()
    or assigned_to = auth.uid()
    or exists (select 1 from public.submissions s where s.id = submission_id
               and (s.inspector_id = auth.uid() or (public.is_company_manager() and s.company_id = public.current_company_id())))
  );

-- Re-inspection fee payments point at their round (and not at the job, so the job's own payment
-- and refunds are unchanged).
alter table public.payments add column if not exists correction_round_id uuid references public.correction_rounds (id) on delete set null;

-- Default re-inspection fee (admins change it on the Companies page, next to the default price).
insert into public.settings (key, value) values ('default_reinspection_cents', '0'::jsonb)
  on conflict (key) do nothing;
