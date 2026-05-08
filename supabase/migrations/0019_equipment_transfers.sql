-- US-EQUIP-01 — assign equipment + transfer log.
-- PRD §3.2 lists `equipment` only. The "history record (transfer log)" AC
-- needs storage; adding equipment_transfers as a schema decision logged in
-- the commit message (prd-guard rule 5). PRD §3.2 should be amended.

create table if not exists equipment_transfers (
  id              uuid primary key default uuid_generate_v4(),
  equipment_id    uuid not null references equipment(id) on delete cascade,
  from_user_id    uuid references profiles(id) on delete set null,
  to_user_id      uuid references profiles(id) on delete set null,
  transferred_by  uuid references profiles(id),
  transferred_at  timestamptz not null default now(),
  note            text
);
create index if not exists idx_equipment_transfers_equipment
  on equipment_transfers(equipment_id, transferred_at desc);

alter table equipment_transfers enable row level security;
create policy et_select on equipment_transfers for select
  using (auth.role() = 'authenticated');
create policy et_admin_write on equipment_transfers for all
  using (is_admin()) with check (is_admin());

-- Atomic assign: stamps assigned_to, appends transfer row, notifies assignee.
create or replace function public.assign_equipment(
  p_equipment_id uuid,
  p_to_user_id   uuid,
  p_note         text default null
)
returns equipment
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_row  equipment;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  select assigned_to into v_from from equipment where id = p_equipment_id for update;
  if not found then
    raise exception 'equipment_not_found' using errcode = 'P0002';
  end if;
  if v_from is not distinct from p_to_user_id then
    -- No-op assignment; just return current row.
    select * into v_row from equipment where id = p_equipment_id;
    return v_row;
  end if;

  update equipment set assigned_to = p_to_user_id where id = p_equipment_id
    returning * into v_row;

  insert into equipment_transfers
    (equipment_id, from_user_id, to_user_id, transferred_by, note)
  values
    (p_equipment_id, v_from, p_to_user_id, auth.uid(), p_note);

  if p_to_user_id is not null then
    insert into notifications (user_id, kind, payload)
    values (
      p_to_user_id,
      'equipment_assigned',
      jsonb_build_object('equipment_id', p_equipment_id, 'name', v_row.name)
    );
  end if;

  return v_row;
end;
$$;

grant execute on function public.assign_equipment(uuid, uuid, text) to authenticated;
