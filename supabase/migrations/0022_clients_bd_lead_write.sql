-- PRD §8 RLS — BD Lead may INSERT/UPDATE clients (kanban drag, new client).
-- Original policy `clients_admin_write` only allowed admins; BD Lead writes
-- failed silently and the audit team confirmed they should be permitted.

drop policy if exists clients_admin_write on clients;

create policy clients_admin_write on clients
  for all
  using (is_admin() or is_bd_lead())
  with check (is_admin() or is_bd_lead());
