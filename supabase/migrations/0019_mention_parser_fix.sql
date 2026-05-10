-- REQ-TASK-07 — mention parsing.
--
-- Original trigger only matched literal @<uuid> in the body and overwrote
-- whatever the client supplied in mentions[]. The UI inserts comments with a
-- pre-resolved mentions array (parsed from @name → profile.id), so the
-- trigger always wiped the array back to {} and notification fan-out broke.
--
-- New behaviour:
--   1. Validate each id the client supplied — keep only ones that match a
--      real profile (defense in depth against forged inserts).
--   2. Also extract any @<uuid> appearing in the body (legacy/bot-friendly)
--      and merge into the set.
--   3. Final `mentions` = union of (validated client list, @<uuid> matches).

create or replace function public.parse_task_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uuid_re text :=
    '@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  resolved uuid[];
begin
  with
    body_uuids as (
      select distinct (regexp_matches(coalesce(new.body, ''), uuid_re, 'g'))[1]::uuid as id
    ),
    client_ids as (
      select distinct unnest(coalesce(new.mentions, array[]::uuid[])) as id
    ),
    candidates as (
      select id from body_uuids
      union
      select id from client_ids
    )
  select coalesce(array_agg(distinct c.id), array[]::uuid[])
    into resolved
    from candidates c
   where exists (select 1 from profiles p where p.id = c.id);

  new.mentions := resolved;
  return new;
end;
$$;
