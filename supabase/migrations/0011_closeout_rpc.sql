-- Closeout flow (REQ-PROJ-04). When all checklist items are checked, the
-- caller invokes close_project(p_id) which: stamps closeout_checklists.completed_at,
-- moves projects.status to 'closed' + projects.archived_at = now(), and seeds
-- a portfolio_workflows row so the project can be considered for awards.
--
-- Single security-definer RPC keeps the three writes atomic and avoids
-- per-table client-side coordination.

create or replace function public.close_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj projects%rowtype;
  has_open_tasks int;
begin
  if not (is_admin() or exists (
    select 1 from projects where id = p_id and created_by = auth.uid()
  )) then
    raise exception 'close_project_forbidden' using errcode = '42501';
  end if;

  select * into proj from projects where id = p_id;
  if not found then
    raise exception 'project_not_found';
  end if;
  if proj.status = 'closed' then
    raise exception 'project_already_closed';
  end if;

  select count(*) into has_open_tasks
    from tasks
   where project_id = p_id
     and archived_at is null
     and status not in ('done', 'cancelled');

  -- Open tasks don't block closure (matches PRD §3 "Project with no tasks →
  -- closeout still allowed (warning surfaced)" — the warning is a UI concern).
  -- We do log the count so the activity feed reflects it.
  perform log_activity('project', p_id, 'closeout', 'open_tasks', null,
    to_jsonb(has_open_tasks));

  -- Mark the most-recent (or only) checklist for this project complete.
  update closeout_checklists
     set completed_at = now()
   where project_id = p_id
     and completed_at is null;

  update projects
     set status = 'closed',
         archived_at = now()
   where id = p_id;

  -- Seed an empty portfolio workflow so awards UI has a row to bind to.
  insert into portfolio_workflows (project_id)
  select p_id
  where not exists (
    select 1 from portfolio_workflows where project_id = p_id
  );
end;
$$;

revoke all on function public.close_project(uuid) from public;
grant execute on function public.close_project(uuid) to authenticated;

-- Companion: reopen_project — admin only, clears archive + portfolio row stays
-- (it's history once it exists).
create or replace function public.reopen_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'reopen_admin_only' using errcode = '42501';
  end if;
  update projects
     set status = 'active',
         archived_at = null,
         reopened_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.reopen_project(uuid) from public;
grant execute on function public.reopen_project(uuid) to authenticated;
