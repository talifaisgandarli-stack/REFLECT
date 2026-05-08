-- REQ-FIN-07: outsource hybrid workflow.
-- Users (responsible_user_id) can advance operational status without seeing
-- amounts. Admin can move into 'paid'. We expose a SECURITY DEFINER RPC so
-- non-admin callers can update the single allowed column without needing
-- direct UPDATE on outsource_items (which is admin-only per §9.1 RLS).

create or replace function public.update_outsource_status(
  p_item_id uuid,
  p_status outsource_status
)
returns outsource_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row outsource_items;
  v_uid uuid := auth.uid();
begin
  select * into v_row from outsource_items where id = p_item_id for update;
  if not found then
    raise exception 'outsource_not_found' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or v_row.responsible_user_id = v_uid) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  -- 'paid' is a financial transition; only admin can record it.
  if p_status = 'paid' and not public.is_admin() then
    raise exception 'paid_admin_only' using errcode = '42501';
  end if;

  update outsource_items
     set status = p_status,
         paid_at = case
           when p_status = 'paid' and paid_at is null then now()
           else paid_at
         end
   where id = p_item_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_outsource_status(uuid, outsource_status) to authenticated;

-- PRD §7 alignment: outsource_user_view should return ONLY project, work_title,
-- deadline, status, responsible_user_id. Tighten it (drops contact_person which
-- the 0002 view leaked).
create or replace view outsource_user_view as
  select id, project_id, work_title, deadline, status, responsible_user_id
  from outsource_items;
grant select on outsource_user_view to authenticated;
