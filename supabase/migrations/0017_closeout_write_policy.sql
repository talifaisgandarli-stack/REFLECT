-- REQ-PROJ-04 — closeout checklist needs write access for project members.
-- Original migration only set SELECT; INSERT/UPDATE silently failed under
-- RLS, which is why ProjectDetail.tsx kept state in useState only.

drop policy if exists cc_write on closeout_checklists;
create policy cc_write on closeout_checklists
  for all using (is_admin() or is_project_member(project_id))
  with check (is_admin() or is_project_member(project_id));

-- Unique constraint so we can upsert by project_id (one checklist per project).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'closeout_checklists_project_id_key'
  ) then
    alter table closeout_checklists add constraint closeout_checklists_project_id_key unique (project_id);
  end if;
end $$;
