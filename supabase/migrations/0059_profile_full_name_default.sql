-- N8 — profiles.full_name was never populated at user creation. The original
-- handle_new_auth_user (migration 0024) inserted only id/email, so every new
-- profile started with full_name = NULL. Result: the dashboard greeting fell
-- back to "arxitekt" and activity attribution showed "Sistem" for any unnamed
-- actor (REQ-DASH-09 greeting, REQ-DASH-01 activity feed).
--
-- Fix: populate full_name from auth metadata when present (the invite signup
-- now passes it), else derive a humanized name from the email local-part, and
-- backfill existing rows so already-created accounts get a name immediately.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, is_active, is_creator)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' '))
    ),
    true,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill accounts that predate this change (full_name null/empty). Derives a
-- readable name from the email local-part; users can refine it on /profile.
update public.profiles
   set full_name = initcap(replace(replace(split_part(email, '@', 1), '.', ' '), '_', ' '))
 where (full_name is null or btrim(full_name) = '')
   and email is not null;
