-- House & Home Inspector Portal - inspection orders (requests from the website form)
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001-0006).

create sequence if not exists public.order_ref_seq start 1001;

create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique default ('OR-' || nextval('public.order_ref_seq')),
  status            text not null default 'new' check (status in ('new', 'scheduled', 'inspected', 'canceled')),

  -- Where it came from (Gravity Forms on houseandhomeaz.com)
  source            text not null default 'wordpress',
  source_form_id    integer,
  source_entry_id   integer,
  requested_at      timestamptz,

  -- What was asked for
  inspection_type   text,          -- portal value: FHA, VA, USDA, Conventional, Porches & Additions...
  inspection_detail text,          -- the form's wording, e.g. "Fannie May/Freddie Mac - Porches and additions only"
  property_address  text,
  requester         jsonb not null default '{}'::jsonb,   -- company, name, email, phone, address
  occupant          jsonb not null default '{}'::jsonb,   -- occupied, name, phone, email, informed, others[]
  access            jsonb not null default '{}'::jsonb,   -- fenced, lockedGates, dogs, underHomeLocked, lockbox, lockboxCode
  report_copies     jsonb not null default '[]'::jsonb,   -- [{ name, email }]
  comments          text,

  -- Scheduling
  scheduled_at      timestamptz,
  inspector_id      uuid references public.profiles (id) on delete set null,
  notes             text,
  submission_id     uuid references public.submissions (id) on delete set null,

  raw               jsonb,         -- the original form entry, for reference
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_form_id, source_entry_id)
);
create index if not exists orders_status_idx on public.orders (status, scheduled_at);
create index if not exists orders_inspector_idx on public.orders (inspector_id, scheduled_at);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- Admins see all orders; an assigned inspector sees their own. (Writes go through the server.)
alter table public.orders enable row level security;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
  using (public.is_admin() or inspector_id = auth.uid());

-- Jobs can point back at the order they came from.
alter table public.submissions add column if not exists order_id uuid references public.orders (id) on delete set null;
