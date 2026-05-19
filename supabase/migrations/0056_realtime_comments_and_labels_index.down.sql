-- Rollback realtime publication addition + labels index
alter publication supabase_realtime drop table if exists public.task_comments;
drop index if exists public.idx_tasks_labels_gin;
