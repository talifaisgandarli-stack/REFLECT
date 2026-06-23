-- Task visibility model change (per product decision): every authenticated user
-- sees ALL tasks except those flagged admin_only; admins see everything. This
-- supersedes the assignee/project-member SELECT restriction from 0002 (and the
-- 0068 variant). INSERT/UPDATE/DELETE policies are unchanged. Requires 0068
-- (admin_only column) to have been applied first.
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (is_admin() or admin_only = false);

-- Comments + status history follow the parent task's visibility, so they stay
-- consistent with the broadened task SELECT (visible unless the task is admin_only).
drop policy if exists tc_select on task_comments;
create policy tc_select on task_comments for select using (
  is_admin() or exists (
    select 1 from tasks t where t.id = task_id and t.admin_only = false
  )
);

drop policy if exists tsh_select on task_status_history;
create policy tsh_select on task_status_history for select using (
  is_admin() or exists (
    select 1 from tasks t where t.id = task_id and t.admin_only = false
  )
);
