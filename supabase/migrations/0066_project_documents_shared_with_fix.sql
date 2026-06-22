-- 0037 tried to add a shared_with clause to pd_select but compared
-- auth.uid() (uuid) = any(shared_with) where shared_with is text[] (0001), which
-- raises 42883 "operator does not exist: uuid = text" at policy creation — so
-- 0037 never applied and the document "share with team member" feature is dead.
-- Recreate pd_select with the uid cast to text so the clause is valid.

drop policy if exists pd_select on project_documents;
create policy pd_select on project_documents for select
  using (
    is_admin()
    or (project_id is not null and is_project_member(project_id))
    or (shared_with is not null and auth.uid()::text = any (shared_with))
  );

-- GIN index for the ANY(...) membership check (idempotent).
create index if not exists project_documents_shared_with_idx
  on project_documents using gin (shared_with);
