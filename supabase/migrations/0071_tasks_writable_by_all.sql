-- Tasks page is for everyone: broaden write access so any authenticated user can
-- insert/update/delete tasks, EXCEPT admin_only tasks which stay admin-only. This
-- supersedes the assignee/project-member write restrictions (0002) and the
-- admin-only delete (0067). SELECT was already broadened in 0070. Requires 0068.

-- INSERT: anyone may create a task, but only admins may create admin_only ones.
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert
  with check (is_admin() or admin_only = false);

-- UPDATE: anyone may edit a non-admin_only task; the WITH CHECK stops a non-admin
-- from flipping a task to admin_only (which would hide it from everyone else).
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update
  using (is_admin() or admin_only = false)
  with check (is_admin() or admin_only = false);

-- DELETE: anyone may delete a non-admin_only task; admin_only stays admin-only.
drop policy if exists tasks_admin_delete on tasks;
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete
  using (is_admin() or admin_only = false);
