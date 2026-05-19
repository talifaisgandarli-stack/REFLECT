-- PRD §REQ-TASK-03 — drag-and-drop "instant and visual": user reordering
-- WITHIN a status column previously was a no-op because the client only
-- moved tasks across columns. We add a `sort_order` column (fractional index)
-- so the client can drop a card between two siblings and persist the order.
--
-- Fractional index strategy: new rows pick `max(sort_order) + 1024` in their
-- column; intra-column moves set `sort_order = (above.sort_order + below.sort_order) / 2`.
-- Numeric precision (double precision) handles ~50 mid-point splits per slot
-- before the gap collapses; we accept that and rebalance on overflow.

alter table public.tasks
  add column if not exists sort_order double precision;

-- Backfill: order existing rows within each (status, project_id) bucket by
-- created_at, stepping in 1024-unit increments so future drops have room.
update public.tasks t
   set sort_order = ranked.row_idx * 1024.0
  from (
    select id,
           row_number() over (
             partition by coalesce(project_id::text, ''), status
             order by created_at
           ) as row_idx
      from public.tasks
     where sort_order is null
  ) ranked
 where t.id = ranked.id;

-- Index supports the "fetch siblings ordered" query the UI runs on the board.
create index if not exists idx_tasks_status_sort
  on public.tasks (project_id, status, sort_order)
  where archived_at is null;
