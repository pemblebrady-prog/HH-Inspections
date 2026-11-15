-- 0011: optional ISN order number on each order (typed in by the office after scheduling in ISN).
alter table public.orders add column if not exists isn_order_number text;
create index if not exists orders_isn_order_number_idx on public.orders (isn_order_number);
