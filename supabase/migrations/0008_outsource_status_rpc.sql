-- REQ-FIN-07 — outsource operational status update for non-admins.
--
-- The base outsource_admin policy (`for all using is_admin()`) keeps both
-- amounts and writes locked to admins. PRD §10.5 says users assigned as
-- `responsible_user_id` must be able to advance operational status WITHOUT
-- seeing money fields. The SECURITY DEFINER function below is the narrow,
-- audited path that grants exactly that — same pattern as
-- mark_announcement_read (migration 0006).
--
-- Rules enforced server-side:
--   - caller must be authenticated
--   - `paid` transition is admin-only (financial state, not operational)
--   - non-admin caller must equal outsource_items.responsible_user_id
--   - status flowing back to 'order' is allowed (typo recovery); skipping
--     forward is not constrained because the spec says "operational status",
--     not "linear forward only".

create or replace function public.update_outsource_status(
  p_id uuid,
  p_status outsource_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_admin boolean := is_admin();
  row_responsible uuid;
begin
  if uid is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status = 'paid' and not caller_admin then
    raise exception 'Only admins can mark outsource items paid';
  end if;

  select responsible_user_id into row_responsible
  from outsource_items
  where id = p_id;

  if row_responsible is null and not caller_admin then
    raise exception 'Outsource item not found or not assigned to you';
  end if;

  if not caller_admin and row_responsible <> uid then
    raise exception 'Outsource item not assigned to you';
  end if;

  update outsource_items
     set status = p_status,
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where id = p_id;
end;
$$;

grant execute on function public.update_outsource_status(uuid, outsource_status) to authenticated;
