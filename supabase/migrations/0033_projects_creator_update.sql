-- PRD §7 / REQ-PROJ-01 — project creator may update their own project.
-- Previously only admins could UPDATE; creators could only SELECT.
-- This adds a narrow UPDATE-only policy scoped to created_by = auth.uid().

create policy projects_creator_update on projects
  for update
  using  (created_by = auth.uid())
  with check (created_by = auth.uid());
