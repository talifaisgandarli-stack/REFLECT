-- REQ-PROJ-04 / US-PROJ-03 — closeout flow.
-- 0002 had only SELECT on closeout_checklists/portfolio_workflows; close
-- the gap and expose a single transactional RPC for "Layihəni Tamamla".

create policy if not exists cc_admin_write on closeout_checklists
  for all using (is_admin()) with check (is_admin());

create policy if not exists pw_admin_write on portfolio_workflows
  for all using (is_admin()) with check (is_admin());

-- close_project: persists the checklist, flips project.status to 'closed',
-- and creates a portfolio_workflows row if one doesn't already exist.
-- Admin-only; refuses if any item is unchecked.
create or replace function public.close_project(
  p_project_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unchecked int;
  v_existing  uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = 'P0001';
  end if;

  select count(*) into v_unchecked
    from jsonb_array_elements(p_items) as it
   where coalesce((it->>'checked')::boolean, false) = false;
  if v_unchecked > 0 then
    raise exception 'items_unchecked' using errcode = 'P0001';
  end if;

  -- Upsert checklist (one per project).
  select id into v_existing from closeout_checklists where project_id = p_project_id limit 1;
  if v_existing is null then
    insert into closeout_checklists (project_id, items, completed_at)
      values (p_project_id, p_items, now());
  else
    update closeout_checklists
       set items = p_items, completed_at = now()
     where id = v_existing;
  end if;

  -- Status flip — projects_activity trigger emits the activity_log entry.
  update projects set status = 'closed' where id = p_project_id;

  -- Portfolio workflow row (idempotent).
  if not exists (select 1 from portfolio_workflows where project_id = p_project_id) then
    insert into portfolio_workflows (project_id) values (p_project_id);
  end if;
end;
$$;

grant execute on function public.close_project(uuid, jsonb) to authenticated;
