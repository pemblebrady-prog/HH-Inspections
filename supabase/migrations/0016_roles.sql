-- 0016: Two-layer roles (Brian, Nov 19).
--   site_role:    optional, House & Home staff: admin | office_manager | engineer (no company needed)
--   company_role: optional, at one company:     company_owner | office_manager | inspector
-- Staff can hold a company role only at House & Home. `role` is now worked out from these two
-- (the portal still reads it): admin, office_manager, engineer, company_owner, company_office, inspector.
-- notify: email on/off switches for company owners and office managers (missing key = on).

alter type public.user_role add value if not exists 'office_manager';
alter type public.user_role add value if not exists 'company_office';

alter table public.profiles add column if not exists site_role text
  check (site_role in ('admin', 'office_manager', 'engineer'));
alter table public.profiles add column if not exists company_role text
  check (company_role in ('company_owner', 'office_manager', 'inspector'));
alter table public.profiles add column if not exists notify jsonb not null default '{}'::jsonb;

-- Fill in from today's single role. Engineers default to House & Home (their own jobs are never charged).
update public.profiles set site_role = role::text where role::text in ('admin', 'engineer') and site_role is null;
update public.profiles set company_role = role::text where role::text in ('company_owner', 'inspector') and company_role is null;
update public.profiles p set company_id = c.id, company_role = 'inspector'
  from (select id from public.companies where is_internal order by created_at limit 1) c
  where p.role::text = 'engineer' and p.company_id is null;
update public.profiles p set company_role = 'inspector'
  where p.site_role is not null and p.company_role is null
    and p.company_id in (select id from public.companies where is_internal);

-- Work out `role` and enforce: staff may only have a company role at House & Home.
create or replace function public.derive_profile_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.site_role is not null and new.company_id is not null
     and not coalesce((select is_internal from public.companies where id = new.company_id), false) then
    raise exception 'House & Home staff can only have a company role at House & Home';
  end if;
  if new.company_id is null then new.company_role := null; end if;
  -- Older code paths that set `role` directly: carry it into the new columns.
  if tg_op = 'UPDATE' and new.role is distinct from old.role
     and new.site_role is not distinct from old.site_role and new.company_role is not distinct from old.company_role then
    if new.role::text in ('admin', 'office_manager', 'engineer') then new.site_role := new.role::text;
    else new.site_role := null; new.company_role := case new.role::text when 'company_office' then 'office_manager' else new.role::text end;
    end if;
  elsif tg_op = 'INSERT' and new.site_role is null and new.company_role is null then
    if new.role::text in ('admin', 'office_manager', 'engineer') then new.site_role := new.role::text;
    elsif new.company_id is not null then new.company_role := case new.role::text when 'company_office' then 'office_manager' else new.role::text end;
    end if;
  end if;
  new.role := (case
    when new.site_role is not null then new.site_role
    when new.company_role = 'office_manager' then 'company_office'
    when new.company_role is not null then new.company_role
    else 'inspector' end)::public.user_role;
  return new;
end $$;

drop trigger if exists profiles_derive_role on public.profiles;
create trigger profiles_derive_role before insert or update on public.profiles
  for each row execute function public.derive_profile_role();

-- Office managers (House & Home) see what admins see; company office managers see what owners see.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role::text in ('admin', 'office_manager') from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.is_company_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role::text in ('company_owner', 'company_office') from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.company_id is distinct from old.company_id
          or new.site_role is distinct from old.site_role or new.company_role is distinct from old.company_role
          or new.active is distinct from old.active) then
    raise exception 'Only an admin can change role, company or active status';
  end if;
  return new;
end $$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_company_manager() and company_id = public.current_company_id()));

drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select to authenticated
  using (
    public.is_admin()
    or (not is_demo and public.is_company_manager() and company_id = public.current_company_id())
    or (not is_demo and inspector_id = auth.uid())
  );

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public.is_admin() or (public.is_company_manager() and company_id = public.current_company_id()));
