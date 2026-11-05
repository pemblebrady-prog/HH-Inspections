-- 0009: Engineer role (Ron): reviews, certifies and sends final letters; no payments, orders, people or billing.
alter type public.user_role add value if not exists 'engineer';
