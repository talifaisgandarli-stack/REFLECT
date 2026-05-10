drop policy if exists clients_admin_write on clients;
create policy clients_admin_write on clients for all using (is_admin()) with check (is_admin());
