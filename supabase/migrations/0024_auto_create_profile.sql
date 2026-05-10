-- PRD §5 — auto-create a profiles row when a new auth.users row appears.
-- Without this, users who log in (magic link, password) get authenticated but
-- have no profile, so requireUser() in api/_lib/auth.ts throws 403 "No profile".
--
-- Default is_active = true, is_creator = false (admins promote manually).
-- Email mirrors auth.users.email so RLS policies that compare emails work.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_active, is_creator)
  values (new.id, new.email, true, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
