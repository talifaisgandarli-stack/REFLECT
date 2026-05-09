-- Restore: drop task_comments from the realtime publication.
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

  if in_pub then
    alter publication supabase_realtime drop table public.task_comments;
  end if;
end $$;
