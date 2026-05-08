-- Task lifecycle: REQ-TASK-04 (cancel reason guard), REQ-TASK-06 (workload),
-- REQ-TASK-08 (archive on done/cancelled).
--
-- All triggers run BEFORE the existing tasks_activity / tasks_block_done so
-- archived_at + workload are persisted before activity rows are emitted.

-- ---------------------------------------------------------------------------
-- REQ-TASK-04 — cancel_reason required when status='cancelled'
-- The UI surfaces a modal; the DB is the final guard.
-- ---------------------------------------------------------------------------
create or replace function public.tasks_cancel_reason_required()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled'
     and (new.cancel_reason is null or btrim(new.cancel_reason) = '') then
    raise exception 'cancel_reason_required'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_cancel_reason_required on tasks;
create trigger tasks_cancel_reason_required
  before insert or update of status, cancel_reason on tasks
  for each row execute function public.tasks_cancel_reason_required();

-- ---------------------------------------------------------------------------
-- REQ-TASK-06 — workload = estimated_duration × (1 + risk_buffer_pct/100)
-- Recomputed on insert + on update of estimated_duration / risk_buffer_pct.
-- Stamps workload_calculated_at so the UI can show staleness.
-- ---------------------------------------------------------------------------
create or replace function public.tasks_recompute_workload()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estimated_duration is null then
    new.workload := null;
    new.workload_calculated_at := null;
  else
    new.workload := round(
      (new.estimated_duration * (1 + coalesce(new.risk_buffer_pct, 0) / 100.0))::numeric,
      2
    );
    new.workload_calculated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_workload on tasks;
create trigger tasks_workload
  before insert or update of estimated_duration, risk_buffer_pct on tasks
  for each row execute function public.tasks_recompute_workload();

-- ---------------------------------------------------------------------------
-- REQ-TASK-08 — auto-archive when status moves to done/cancelled
-- Stamps archived_at = now() unless already set; un-archives on reopen.
-- ---------------------------------------------------------------------------
create or replace function public.tasks_auto_archive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('done', 'cancelled') then
    if new.archived_at is null then
      new.archived_at := now();
    end if;
  elsif tg_op = 'UPDATE'
        and old.status in ('done', 'cancelled')
        and new.status not in ('done', 'cancelled') then
    -- explicit reopen: clear archive stamp so the task returns to live boards
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_auto_archive on tasks;
create trigger tasks_auto_archive
  before insert or update of status on tasks
  for each row execute function public.tasks_auto_archive();
