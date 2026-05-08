-- Realtime publication (PRD §3.4) — broadcast row-level changes for tables
-- the UI subscribes to. RLS still applies to the subscriber, so only rows
-- the user is allowed to read get delivered.
--
-- Idempotent: safe to re-run; no-op when the table is already in the publication.

do $$
declare
  t text;
  in_pub boolean;
begin
  for t in select unnest(array[
    'tasks',
    'notifications',
    'activity_log',
    'mirai_messages',
    'announcements'
  ])
  loop
    select exists(
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) into in_pub;

    if not in_pub then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
