-- 0008: company admin controls — default price, custom price per company, company on/off.

-- Portal-wide settings (one row per setting). Only the server (secret key) writes these.
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
alter table public.settings enable row level security;
drop policy if exists "settings readable when signed in" on public.settings;
create policy "settings readable when signed in" on public.settings for select to authenticated using (true);

insert into public.settings (key, value) values ('default_price_cents', '13500'::jsonb)
on conflict (key) do nothing;

-- Custom price: a number overrides the default; empty (null) means "use the default price".
alter table public.companies alter column price_cents drop not null;
alter table public.companies alter column price_cents drop default;
update public.companies set price_cents = null where price_cents = 13500;  -- everyone at $135 follows the default
alter table public.companies drop constraint if exists companies_price_cents_check;
alter table public.companies add constraint companies_price_cents_check check (price_cents is null or price_cents >= 0);

-- Company on/off. Off = nobody at the company can sign in or submit; history is kept.
alter table public.companies add column if not exists active boolean not null default true;
alter table public.companies add column if not exists deactivated_at timestamptz;
