-- US-PROJ-05: admin reopens a closed project. Activity log fires from the
-- existing projects_activity_trg when status changes.
create or replace function public.reopen_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status project_status;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  select status into v_status from projects where id = p_project_id for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'closed' then
    raise exception 'project_not_closed' using errcode = 'P0001';
  end if;

  update projects
     set status = 'active',
         reopened_at = now()
   where id = p_project_id;
end;
$$;

grant execute on function public.reopen_project(uuid) to authenticated;
