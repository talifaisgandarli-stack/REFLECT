-- PRD §REQ-TASK-09 — when expertise children are seeded with the parent
-- (via create_task_with_expertise_seeds in 0063), the children should
-- inherit the parent's duration_unit, risk_buffer_pct, priority, and
-- labels. Previous version only carried project_id + parent_task_id +
-- task_level + is_expertise_subtask + assignee_ids, leaving the children
-- with NULL duration_unit (UI fell back to hours interpretation against a
-- null estimated_duration), NULL priority, and empty labels — so they did
-- not appear under the parent's filter views.

create or replace function public.create_task_with_expertise_seeds(
  p_payload jsonb,
  p_children text[] default array[]::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_parent_id uuid;
  parent_project uuid;
  parent_assignees uuid[];
  parent_level int;
  parent_unit text;
  parent_risk int;
  parent_priority text;
  parent_labels text[];
  child_title text;
begin
  insert into public.tasks (
    title, description, status, project_id, start_date, deadline,
    estimated_duration, duration_unit, risk_buffer_pct,
    is_expertise_subtask, parent_task_id, task_level, assignee_ids,
    labels, priority
  )
  values (
    nullif(p_payload->>'title', ''),
    nullif(p_payload->>'description', ''),
    coalesce((p_payload->>'status')::task_status, 'queued'),
    nullif(p_payload->>'project_id', '')::uuid,
    nullif(p_payload->>'start_date', '')::date,
    nullif(p_payload->>'deadline', '')::date,
    nullif(p_payload->>'estimated_duration', '')::numeric,
    nullif(p_payload->>'duration_unit', ''),
    coalesce((p_payload->>'risk_buffer_pct')::int, 0),
    coalesce((p_payload->>'is_expertise_subtask')::boolean, false),
    nullif(p_payload->>'parent_task_id', '')::uuid,
    coalesce((p_payload->>'task_level')::int, 0),
    coalesce(array(select jsonb_array_elements_text(p_payload->'assignee_ids'))::uuid[], array[]::uuid[]),
    coalesce(array(select jsonb_array_elements_text(p_payload->'labels')), array[]::text[]),
    nullif(p_payload->>'priority', '')
  )
  returning id, project_id, assignee_ids, task_level, duration_unit,
            risk_buffer_pct, priority, labels
  into new_parent_id, parent_project, parent_assignees, parent_level,
       parent_unit, parent_risk, parent_priority, parent_labels;

  if array_length(p_children, 1) > 0 then
    foreach child_title in array p_children loop
      insert into public.tasks (
        title, status, project_id, parent_task_id, task_level,
        is_expertise_subtask, assignee_ids,
        duration_unit, risk_buffer_pct, priority, labels
      )
      values (
        child_title, 'queued', parent_project, new_parent_id,
        parent_level + 1, true, parent_assignees,
        parent_unit, coalesce(parent_risk, 0), parent_priority, coalesce(parent_labels, array[]::text[])
      );
    end loop;
  end if;

  return new_parent_id;
end;
$$;
