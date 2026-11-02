-- House & Home Inspector Portal - saved payment methods (Stripe)
-- Paste into Supabase -> SQL Editor -> New query -> Run (after 0001-0003).

alter table public.companies
  add column if not exists payment_method_id     text,   -- Stripe PaymentMethod (pm_...)
  add column if not exists payment_method_label  text,   -- e.g. "Chase checking ..6789"
  add column if not exists payment_mandate_id    text,   -- ACH authorization (mandate_...)
  add column if not exists payment_status_note   text,   -- e.g. "Waiting for bank verification"
  add column if not exists payment_ready_at      timestamptz;

alter table public.payments
  add column if not exists stripe_charge_status text;
