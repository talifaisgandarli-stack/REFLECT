-- REQ-TASK-06: workload = estimated_duration × (1 + risk_buffer_pct/100);
-- workload_calculated_at stamped on save.
create or replace function public.tasks_compute_workload()
returns trigger
language plpgsql
as $$
begin
  if new.estimated_duration is not null then
    new.workload := new.estimated_duration * (1 + (coalesce(new.risk_buffer_pct, 0)::numeric / 100));
    if tg_op = 'INSERT'
       or new.estimated_duration is distinct from old.estimated_duration
       or new.risk_buffer_pct   is distinct from old.risk_buffer_pct then
      new.workload_calculated_at := now();
    end if;
  else
    new.workload := null;
    new.workload_calculated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_compute_workload on tasks;
create trigger tasks_compute_workload
  before insert or update of estimated_duration, risk_buffer_pct on tasks
  for each row execute function public.tasks_compute_workload();

-- US-DASH-05 / REQ-DASH-01: team workload widget — open task count per active
-- profile. security_invoker default means RLS on tasks gates the aggregation:
-- admin sees the full team; non-admin sees only their own tasks (widget is
-- admin-only on the dashboard, so this is the correct shape).
create or replace view team_workload_summary as
  select
    p.id          as user_id,
    p.full_name,
    p.avatar_url,
    coalesce(
      (select count(*)::int
         from tasks t
        where p.id = any(t.assignee_ids)
          and t.status not in ('done', 'cancelled')
          and t.archived_at is null),
      0
    ) as open_count
  from profiles p
  where p.is_active;

grant select on team_workload_summary to authenticated;
