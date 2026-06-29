do $$
begin
  if exists(
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime drop table public.profiles';
  end if;
end $$;
