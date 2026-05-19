-- 0043 — REQ-CRM — admin client merge / dedupe.
-- Single SECURITY DEFINER RPC that:
--   1. Re-points all FK references on the source client to the target
--      (projects.client_id, receivables.client_id, project_documents.client_id,
--       client_interactions.client_id, client_stage_history.client_id,
--       retrospective_surveys.client_id).
--   2. Soft-deletes the source row by setting pipeline_stage='archive' and
--      appending a note to its name (so we keep the row + audit trail per
--      PRD §10.2 "rename, never drop").
--
-- Admin-only. Wrapped in a single transaction.

create or replace function clients_merge(p_source uuid, p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Admin only';
  end if;
  if p_source = p_target then
    raise exception 'Source and target must differ';
  end if;
  if not exists (select 1 from clients where id = p_source) then
    raise exception 'Source client not found';
  end if;
  if not exists (select 1 from clients where id = p_target) then
    raise exception 'Target client not found';
  end if;

  -- Re-point FK references. Skip tables that may not exist by guarding with
  -- to_regclass — keeps the RPC forward-compatible.
  if to_regclass('public.projects') is not null then
    update projects set client_id = p_target where client_id = p_source;
  end if;
  if to_regclass('public.receivables') is not null then
    update receivables set client_id = p_target where client_id = p_source;
  end if;
  if to_regclass('public.project_documents') is not null then
    update project_documents set client_id = p_target where client_id = p_source;
  end if;
  if to_regclass('public.client_interactions') is not null then
    update client_interactions set client_id = p_target where client_id = p_source;
  end if;
  if to_regclass('public.client_stage_history') is not null then
    update client_stage_history set client_id = p_target where client_id = p_source;
  end if;
  if to_regclass('public.retrospective_surveys') is not null then
    update retrospective_surveys set client_id = p_target where client_id = p_source;
  end if;
  if to_regclass('public.incomes') is not null then
    update incomes set client_id = p_target where client_id = p_source;
  end if;

  -- Soft-archive the source: push to 'archived' stage, prefix name so it's
  -- visible in any audit-log queries.
  update clients
     set pipeline_stage = 'archived',
         name = '[merged → ' || p_target::text || '] ' || name
   where id = p_source;

  -- Audit log (best-effort)
  begin
    insert into audit_log(actor_id, action, resource, ip, user_agent, meta)
    values (auth.uid(), 'client.merge', 'clients', null, null,
            jsonb_build_object('source', p_source, 'target', p_target));
  exception when others then
    -- audit failure must not abort the merge
    null;
  end;
end;
$$;

grant execute on function clients_merge(uuid, uuid) to authenticated;
