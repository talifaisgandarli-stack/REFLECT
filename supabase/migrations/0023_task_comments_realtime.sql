-- Add task_comments to the realtime publication (slice 134, follow-up
-- to slice 121 + 132). The picker writes a comment row, the parser
-- trigger from 0004 + the prefs gate from 0021 fan out a notification,
-- but the *comment list* on the task detail page didn't pick up new
-- comments without a hard refresh — there was no realtime subscription.
--
-- Pattern matches 0008's idempotent block: re-running this migration
-- after a partial apply is a no-op.

do $$
declare
  in_pub boolean;
begin
  select exists(
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'task_comments'
  ) into in_pub;

  if not in_pub then
    alter publication supabase_realtime add table public.task_comments;
  end if;
end $$;
