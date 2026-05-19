-- Rollback for REQ-TASK-05 subtask blocking trigger
drop trigger if exists tasks_block_done_with_open_children on public.tasks;
drop function if exists public.tasks_block_done_with_open_children();
