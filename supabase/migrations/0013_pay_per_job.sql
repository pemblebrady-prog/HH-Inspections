-- 0013: pay-as-you-go companies (often solo inspectors): no saved payment method;
-- they pay by card for each job after submitting, and the job goes to review once paid.
alter table public.companies add column if not exists pay_per_job boolean not null default false;
