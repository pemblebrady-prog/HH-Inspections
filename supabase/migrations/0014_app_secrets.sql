-- 0014: private server-only settings (e.g. the Gmail connection used to send portal email).
-- Row level security is on with NO policies, so only the server (secret key) can read or write.
create table if not exists public.app_secrets (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
alter table public.app_secrets enable row level security;
