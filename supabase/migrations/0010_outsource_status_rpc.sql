-- Outsource hybrid workflow (REQ-FIN-07).
-- Users marked responsible_user_id can advance the operational status
-- (Sifariş → İcra → Təhvil) WITHOUT seeing or touching money fields.
-- Admins can do anything plus the final Ödənildi step which stamps paid_at.
--
-- Pattern matches set_client_stage from 0005: a security-definer RPC,
-- never a direct UPDATE policy that would have to grant column-level access.

create or replace function public.outsource_advance_status(
  p_id uuid,
  p_next outsource_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur outsource_items%rowtype;
  is_responsible boolean;
  am_admin boolean := is_admin();
begin
  select * into cur from outsource_items where id = p_id;
  if not found then
    raise exception 'outsource_not_found';
  end if;

  is_responsible := cur.responsible_user_id is not null
                    and cur.responsible_user_id = auth.uid();

  if not am_admin and not is_responsible then
    raise exception 'outsource_forbidden' using errcode = '42501';
  end if;

  -- Allowed transitions:
  --   order      → in_progress (responsible OR admin)
  --   in_progress → delivered  (responsible OR admin)
  --   delivered  → paid        (admin only — money side)
  if cur.status = 'order' and p_next = 'in_progress' then
    null;
  elsif cur.status = 'in_progress' and p_next = 'delivered' then
    null;
  elsif cur.status = 'delivered' and p_next = 'paid' then
    if not am_admin then
      raise exception 'outsource_paid_admin_only' using errcode = '42501';
    end if;
  else
    raise exception 'outsource_invalid_transition: % → %', cur.status, p_next
      using errcode = 'check_violation';
  end if;

  update outsource_items
     set status = p_next,
         paid_at = case when p_next = 'paid' then now() else paid_at end
   where id = p_id;
end;
$$;

revoke all on function public.outsource_advance_status(uuid, outsource_status) from public;
grant execute on function public.outsource_advance_status(uuid, outsource_status) to authenticated;
