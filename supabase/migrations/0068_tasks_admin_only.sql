-- Admin-only tasks: some tasks should be visible to admins only, hidden from
-- regular members/assignees. Additive — defaults false, so every existing task
-- stays visible exactly as before.
alter table tasks add column if not exists admin_only boolean not null default false;

-- Re-create the select policy (originally 0002_rls.sql) so an admin_only task is
-- hidden from non-admins even when they are an assignee or a project member.
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (
    is_admin()
    or (admin_only = false and (auth.uid() = any(assignee_ids) or is_project_member(project_id)))
  );
