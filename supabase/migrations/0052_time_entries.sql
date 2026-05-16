-- 0052 — Time tracking against tasks (PRD §12 "time tracking per task" was
-- listed as v1 out-of-scope, but explicitly requested by the user as a
-- focused initiative). One row per timer start/stop session; a user can
-- have at most ONE active (ended_at IS NULL) entry at a time.
--
-- Day-rollup is computed client-side or via a future view; this migration
-- only persists raw sessions.

create table if not exists time_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Generated column: seconds elapsed (null when timer still running)
  duration_seconds integer generated always as (
    case
      when ended_at is null then null
      else extract(epoch from (ended_at - started_at))::int
    end
  ) stored,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists time_entries_user_idx on time_entries (user_id, started_at desc);
create index if not exists time_entries_task_idx on time_entries (task_id, started_at desc);

-- One active timer per user — partial unique index enforced at DB level
create unique index if not exists time_entries_one_active_per_user
  on time_entries (user_id) where ended_at is null;

-- RLS: user owns own entries; admin sees all
alter table time_entries enable row level security;

create policy time_entries_self_select on time_entries
  for select using (auth.uid() = user_id or is_admin());
create policy time_entries_self_write on time_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
