-- 0037 — REQ-CRM-06 — extend project_documents SELECT policy to honour
-- shared_with[]. Previously only admins or project members could read;
-- the UI now lets admins/owners share a doc with specific team members
-- (project_documents.shared_with uuid[] column already exists), but RLS
-- did NOT grant those users SELECT access — making the feature half-broken.
--
-- This migration:
--   1. Drops the old pd_select policy.
--   2. Recreates it with an additional clause: auth.uid() = ANY(shared_with).
--   3. Indexes shared_with for efficient policy evaluation.
--
-- Safe / additive: never removes existing access for admins or project members.

drop policy if exists pd_select on project_documents;

create policy pd_select on project_documents for select
  using (
    is_admin()
    or (project_id is not null and is_project_member(project_id))
    or (shared_with is not null and auth.uid() = any(shared_with))
  );

-- GIN index on shared_with so the ANY(...) check stays fast at scale.
-- IF NOT EXISTS keeps re-runs idempotent.
create index if not exists project_documents_shared_with_idx
  on project_documents using gin (shared_with);
