-- PRD §3.4 — add task_comments to the realtime publication so collaborative
-- comment editing reflects across sessions within the same 500ms p95 budget.
-- RLS still applies; subscribers only receive comments on tasks they can SELECT.
--
-- PRD §3.5 — GIN index on tasks.labels so label-array filters scale; without
-- this, "labels contains 'portfolio'" planner falls back to seq-scan and the
-- Tasks board locks up on 1000+ rows.

do $$
declare
  in_pub boolean;
begin
  select exists(
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'task_comments'
  ) into in_pub;
  if not in_pub then
    execute 'alter publication supabase_realtime add table public.task_comments';
  end if;
end $$;

-- GIN index for array contains queries on labels. Column nullable so we
-- coalesce in the index expression. IF NOT EXISTS keeps re-run safe.
create index if not exists idx_tasks_labels_gin
  on public.tasks using gin (coalesce(labels, array[]::text[]));
