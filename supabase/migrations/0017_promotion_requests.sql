-- Promotion requests (PRD §M9.2 v2 candidate).
-- Users can submit a request to advance to the next career level; admins
-- approve/deny via an RPC that on approval updates profiles.career_level_id
-- and stamps decided_at.

create type promotion_status as enum ('pending', 'approved', 'denied', 'cancelled');

create table if not exists promotion_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  current_level_id uuid references career_levels(id),
  target_level_id uuid not null references career_levels(id),
  status promotion_status not null default 'pending',
  rationale text,
  approver_id uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_promotion_employee
  on promotion_requests(employee_id, created_at desc);

alter table promotion_requests enable row level security;
create policy promo_self_or_admin on promotion_requests for select
  using (employee_id = auth.uid() or is_admin());
create policy promo_self_insert on promotion_requests for insert
  with check (employee_id = auth.uid());
create policy promo_self_cancel on promotion_requests for update
  using (employee_id = auth.uid() and status = 'pending')
  with check (employee_id = auth.uid() and status in ('pending', 'cancelled'));
create policy promo_admin_decide on promotion_requests for update
  using (is_admin()) with check (is_admin());

-- Approve flow: stamps decided_at + (on approval) updates profile.career_level_id.
create or replace function public.promotion_decide(
  p_id uuid,
  p_status promotion_status,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare cur promotion_requests%rowtype;
begin
  if not is_admin() then
    raise exception 'promotion_decide_admin_only' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'denied') then
    raise exception 'promotion_decide_invalid_status';
  end if;

  select * into cur from promotion_requests where id = p_id;
  if not found then raise exception 'promotion_not_found'; end if;
  if cur.status <> 'pending' then
    raise exception 'promotion_already_decided';
  end if;

  update promotion_requests
     set status = p_status,
         approver_id = auth.uid(),
         decided_at = now(),
         decision_note = coalesce(p_note, decision_note)
   where id = p_id;

  if p_status = 'approved' then
    update profiles
       set career_level_id = cur.target_level_id
     where id = cur.employee_id;
  end if;
end;
$$;

revoke all on function public.promotion_decide(uuid, promotion_status, text) from public;
grant execute on function public.promotion_decide(uuid, promotion_status, text) to authenticated;
