-- Restore the original @<uuid>-only parser from migration 0004.
create or replace function public.parse_task_comment_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uuid_re text :=
    '@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  m uuid[];
begin
  with matches as (
    select distinct (regexp_matches(coalesce(new.body, ''), uuid_re, 'g'))[1]::uuid as id
  )
  select array_agg(id)
    into m
    from matches
   where exists (select 1 from profiles p where p.id = matches.id);
  new.mentions := coalesce(m, array[]::uuid[]);
  return new;
end;
$$;
