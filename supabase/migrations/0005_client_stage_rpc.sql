-- REQ-CRM-01: drag → stage_history; "Udulan" requires lost_reason.
-- The clients_activity trigger (0004) already inserts the history row.
-- This RPC enforces the lost_reason invariant atomically and patches the
-- just-inserted row in one round-trip.

create or replace function public.set_client_stage(
  p_client_id uuid,
  p_to_stage client_pipeline_stage,
  p_lost_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from client_pipeline_stage;
begin
  if p_to_stage = 'lost' and (p_lost_reason is null or btrim(p_lost_reason) = '') then
    raise exception 'lost_reason_required' using errcode = 'P0001';
  end if;

  select pipeline_stage into v_from from clients where id = p_client_id for update;
  if not found then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;

  if v_from is not distinct from p_to_stage then
    return;
  end if;

  update clients
     set pipeline_stage = p_to_stage
   where id = p_client_id;

  if p_lost_reason is not null then
    update client_stage_history
       set lost_reason = p_lost_reason
     where id = (
       select id from client_stage_history
        where client_id = p_client_id
          and to_stage = p_to_stage
        order by changed_at desc
        limit 1
     );
  end if;
end;
$$;

grant execute on function public.set_client_stage(uuid, client_pipeline_stage, text) to authenticated;

-- REQ-CRM-03: a logged interaction bumps clients.last_interaction_at.
-- Done as a trigger so BD Lead inserts (allowed by RLS) update the parent
-- without needing UPDATE on clients.
create or replace function public.client_interactions_touch_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update clients
     set last_interaction_at = new.occurred_at
   where id = new.client_id
     and (last_interaction_at is null or last_interaction_at < new.occurred_at);
  return new;
end;
$$;

drop trigger if exists client_interactions_touch on client_interactions;
create trigger client_interactions_touch
  after insert on client_interactions
  for each row execute function public.client_interactions_touch_parent();

