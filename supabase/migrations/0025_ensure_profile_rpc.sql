-- PRD §5 — bulletproof profile bootstrap.
--
-- The auto-create-profile fallback in requireUser() needs to insert into
-- profiles even when the service_role lacks an explicit GRANT. We solve this
-- with a SECURITY DEFINER function owned by postgres (superuser), so it runs
-- with full table privileges regardless of who calls it.
--
-- Also explicitly grant table-level privileges to service_role + authenticated
-- as belt-and-suspenders.

grant select, insert, update on public.profiles to service_role;
grant select on public.profiles to authenticated;

create or replace function public.ensure_profile(p_id uuid, p_email text)
returns table (
  id uuid,
  email text,
  is_creator boolean,
  is_active boolean,
  role_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_active, is_creator)
  values (p_id, coalesce(p_email, ''), true, false)
  on conflict (id) do update
    set email = coalesce(excluded.email, profiles.email);

  return query
    select p.id, p.email, p.is_creator, p.is_active, p.role_id
      from public.profiles p
     where p.id = p_id;
end;
$$;

revoke all on function public.ensure_profile(uuid, text) from public;
grant execute on function public.ensure_profile(uuid, text) to service_role, authenticated;
