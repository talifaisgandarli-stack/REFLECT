-- Perf-only refinement of is_project_member() — membership semantics are
-- UNCHANGED (owner OR task assignee), per the 2026-06-25 decision not to widen
-- RLS access. The function runs once per row in several SELECT/ALL policies
-- (projects, tasks, closeout_checklists, project_documents), so its inner
-- lookups must stay index-backed.
--
-- The only change: the assignee check was `auth.uid() = any(t.assignee_ids)`,
-- which the planner CANNOT serve from the existing GIN index
-- (idx_tasks_assignees, migration 0001). Rewriting it as the array-containment
-- operator `t.assignee_ids @> array[auth.uid()]` is logically identical
-- (assignee_ids is `uuid[] not null default '{}'` and auth.uid() is non-null in
-- an authenticated session) but is GIN-indexable, so the assignee branch can
-- use the index instead of scanning the project's task rows.
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from projects where id = p and created_by = auth.uid())
    or exists (
      select 1 from tasks t
      where t.project_id = p and t.assignee_ids @> array[auth.uid()]
    );
$$;
