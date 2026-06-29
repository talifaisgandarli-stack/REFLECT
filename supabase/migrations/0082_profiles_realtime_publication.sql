-- Roster live-sync — add `profiles` to the realtime publication so a change
-- like is_active (admin deactivates a user) broadcasts to every connected
-- client, not just the admin who made it. Without this, other members kept
-- seeing a deactivated teammate in the roster until their next manual refetch.
--
-- RLS still applies to subscribers (profiles_select = any authenticated user),
-- which matches the roster audience. Idempotent: no-op if already published.
do $$
declare
  in_pub boolean;
begin
  select exists(
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'profiles'
  ) into in_pub;

  if not in_pub then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;
