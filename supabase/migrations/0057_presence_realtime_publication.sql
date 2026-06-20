-- Presence realtime (REQ-PRESENCE-01 / PRD §10.5.1) — add `user_presence` to
-- the realtime publication so presence updates broadcast over a Supabase
-- realtime channel instead of being polled. RLS (policy `up_select`) still
-- applies to subscribers, so a user only receives rows they may SELECT — here
-- every authenticated team member, which is exactly the presence audience.
--
-- §10.5.1 perf budget: realtime updates ≤2s end-to-end. The prior 30s
-- `refetchInterval` poll in useTeamPresence is removed in the same change.
--
-- Idempotent: safe to re-run; no-op when the table is already in the publication.

do $$
declare
  in_pub boolean;
begin
  select exists(
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'user_presence'
  ) into in_pub;

  if not in_pub then
    execute 'alter publication supabase_realtime add table public.user_presence';
  end if;
end $$;
