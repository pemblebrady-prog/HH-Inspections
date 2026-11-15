-- 0010: engineer (PE) details on profiles; which engineer a job's letter was made for.
alter table public.profiles add column if not exists pe_title                text;   -- e.g. "Professional Engineer"
alter table public.profiles add column if not exists pe_license_number       text;
alter table public.profiles add column if not exists pe_license_state        text default 'AZ';
alter table public.profiles add column if not exists pe_license_expires      date;
alter table public.profiles add column if not exists stamp_drive_file_id     text;   -- private Drive image
alter table public.profiles add column if not exists signature_drive_file_id text;   -- private Drive image
alter table public.profiles add column if not exists pe_expiry_warned_days   integer; -- last expiry warning sent (60/30/7/0)

alter table public.submissions add column if not exists letter_engineer_id uuid references public.profiles(id) on delete set null;
