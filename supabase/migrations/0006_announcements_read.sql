-- Announcements read tracking — PRD §8.6 (read_by jsonb keyed by user_id) +
-- the "Hamısını oxunmuş işarələ" bulk action.
--
-- The base ann_admin policy keeps UPDATE locked to admins; these
-- SECURITY DEFINER functions are the narrow, audited paths that let any
-- authenticated user mark *their own* read state without widening RLS.

create or replace function public.mark_announcement_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'auth.uid() is null';
  end if;
  update announcements
     set read_by = coalesce(read_by, '{}'::jsonb)
                   || jsonb_build_object(uid::text, to_jsonb(now()))
   where id = p_id
     and (approved or created_by = uid);
end;
$$;

create or replace function public.mark_all_announcements_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'auth.uid() is null';
  end if;
  update announcements
     set read_by = coalesce(read_by, '{}'::jsonb)
                   || jsonb_build_object(uid::text, to_jsonb(now()))
   where (approved or created_by = uid)
     and not (read_by ? uid::text);
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_announcement_read(uuid) to authenticated;
grant execute on function public.mark_all_announcements_read() to authenticated;
