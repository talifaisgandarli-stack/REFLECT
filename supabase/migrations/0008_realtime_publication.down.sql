-- Down: 0008 realtime publication.
-- Removes tables from the realtime publication; the publication itself
-- is managed by Supabase and never dropped.

do $$
declare t text;
begin
  for t in select unnest(array[
    'tasks',
    'notifications',
    'activity_log',
    'mirai_messages',
    'announcements'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime drop table public.%I', t);
    exception when others then
      raise notice 'skip drop %: %', t, sqlerrm;
    end;
  end loop;
end $$;
