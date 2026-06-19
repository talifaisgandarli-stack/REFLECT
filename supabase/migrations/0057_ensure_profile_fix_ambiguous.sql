-- Fix "column reference 'id' is ambiguous" in ensure_profile().
--
-- 0025 declared the RPC as:
--   returns table (id uuid, email text, is_creator boolean, ...)
-- which creates PL/pgSQL OUT variables named `id`, `email`, etc. Inside
-- the function body, statements like
--   insert into profiles (id, email, ...) values (...)
--   on conflict (id) do update set email = coalesce(excluded.email, profiles.email)
-- have name collisions: Postgres can't tell whether `id` / `email` refer
-- to the OUT vars or the table columns. Until recently no caller hit
-- this because requireUser() only invoked the RPC when a profile already
-- existed (the SELECT-then-RPC pattern took the SELECT branch); the
-- invitation signup endpoint added in this PR is the first path that
-- exercises the actual INSERT, surfacing the latent ambiguity as
--   ERROR:  column reference "id" is ambiguous
--
-- Fix: add `#variable_conflict use_column` so PL/pgSQL prefers the table
-- column on collision, which is the intended semantic here. The IN
-- parameters (p_id, p_email) keep their unique names so they aren't
-- affected by the directive.

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
#variable_conflict use_column
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
