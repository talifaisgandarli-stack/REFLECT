-- 0037 down — revert pd_select to admin/project-member only.

drop policy if exists pd_select on project_documents;

create policy pd_select on project_documents for select
  using (is_admin() or (project_id is not null and is_project_member(project_id)));

drop index if exists project_documents_shared_with_idx;
