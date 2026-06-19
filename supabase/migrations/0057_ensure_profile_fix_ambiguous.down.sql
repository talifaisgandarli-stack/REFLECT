-- Revert to the original (ambiguous) function body from 0025. Kept for
-- forward/backward parity; in practice nobody should ever want this.

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
