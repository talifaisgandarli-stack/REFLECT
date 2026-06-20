-- Down: 0057 presence realtime publication.
-- Removes `user_presence` from the realtime publication; the publication
-- itself is managed by Supabase and never dropped.

do $$
begin
  begin
    execute 'alter publication supabase_realtime drop table public.user_presence';
  exception when others then
    raise notice 'skip drop user_presence: %', sqlerrm;
  end;
end $$;
