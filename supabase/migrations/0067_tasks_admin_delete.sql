-- Hard-delete for tasks (danger zone, admin only).
-- 0002_rls.sql shipped select/insert/update policies for `tasks` but no delete
-- policy, so with RLS enabled DELETE was denied to every client role. Admins can
-- now permanently remove a task; the 0001 FKs cascade to subtasks
-- (parent_task_id), task_comments, task_status_history and time_entries.
-- Soft-archive (archived_at) remains the default, non-destructive path.
create policy tasks_admin_delete on tasks for delete using (is_admin());
