-- 0012: map coordinates of each order's address (looked up once, for the "are you at the job site?" check).
alter table public.orders add column if not exists geo_lat double precision;
alter table public.orders add column if not exists geo_lng double precision;
alter table public.orders add column if not exists geocoded_at timestamptz;
