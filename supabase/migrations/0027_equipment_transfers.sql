-- US-EQUIP-01 — admin reassigns equipment; trigger appends a transfer history
-- record and pushes an in-app notification to the new assignee.

create table if not exists equipment_transfers (
  id              uuid primary key default uuid_generate_v4(),
  equipment_id    uuid not null references equipment(id) on delete cascade,
  from_user_id    uuid references profiles(id),
  to_user_id      uuid references profiles(id),
  changed_by      uuid references profiles(id),
  note            text,
  transferred_at  timestamptz not null default now()
);
create index if not exists idx_eq_transfers_equipment
  on equipment_transfers(equipment_id, transferred_at desc);

alter table equipment_transfers enable row level security;
create policy eqx_select on equipment_transfers for select
  using (auth.role() = 'authenticated');
create policy eqx_admin_write on equipment_transfers for all
  using (is_admin()) with check (is_admin());

-- assign_equipment(equipment_id, to_user_id, note): admin-only RPC.
-- Updates equipment.assigned_to, appends an equipment_transfers row, and
-- sends an in-app notification to the new assignee. One round-trip from the
-- client; carries `note` which a plain UPDATE cannot.
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
  v_eq    equipment;
  v_from  uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  select assigned_to into v_from from equipment where id = p_equipment_id for update;
  if not found then
    raise exception 'equipment_not_found' using errcode = 'P0002';
  end if;

  if v_from is not distinct from p_to_user_id then
    select * into v_eq from equipment where id = p_equipment_id;
    return v_eq;
  end if;

  update equipment set assigned_to = p_to_user_id where id = p_equipment_id
    returning * into v_eq;

  insert into equipment_transfers (equipment_id, from_user_id, to_user_id, changed_by, note)
    values (p_equipment_id, v_from, p_to_user_id, auth.uid(), p_note);

  if p_to_user_id is not null then
    insert into notifications (user_id, kind, payload)
      values (
        p_to_user_id,
        'equipment_assigned',
        jsonb_build_object(
          'equipment_id', v_eq.id,
          'equipment_name', v_eq.name,
          'serial', v_eq.serial
        )
      );
  end if;

  return v_eq;
end;
$$;

grant execute on function public.assign_equipment(uuid, uuid, text) to authenticated;
