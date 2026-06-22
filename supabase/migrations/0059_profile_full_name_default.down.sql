-- Down: restore the original id/email-only profile-creation trigger (0024).
-- The full_name backfill is intentionally not reverted (no record of prior
-- NULLs, and a populated name is harmless).

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
