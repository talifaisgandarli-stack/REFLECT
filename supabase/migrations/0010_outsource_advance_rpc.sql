-- Outsource status advance RPC — REQ-FIN-07.
--
-- PRD: "Users can update operational status without seeing amounts."
-- outsource_items has admin-only RLS, so we expose a security-definer
-- function that only touches the status column and enforces authz:
--   - admin: any item
--   - non-admin: only items where responsible_user_id = auth.uid()
-- Cannot regress a paid item (terminal state).

create or replace function public.advance_outsource_status(
  p_item_id uuid,
  p_new_status outsource_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  current_status outsource_status;
  is_responsible boolean;
begin
  select status, (responsible_user_id = auth.uid())
  into current_status, is_responsible
  from outsource_items
  where id = p_item_id;

  if not found then
    raise exception 'Item not found';
  end if;

  if not (is_admin() or is_responsible) then
    raise exception 'Permission denied';
  end if;

  if current_status = 'paid' then
    raise exception 'Cannot change status of a paid item';
  end if;

  update outsource_items set status = p_new_status where id = p_item_id;
end;
$$;

grant execute on function public.advance_outsource_status(uuid, outsource_status)
  to authenticated;
