-- Explicit table-level grants for knowledge_base so the service_role can
-- DELETE/INSERT during PDF upload. Mirrors the earlier profiles fix.

grant select, insert, update, delete on public.knowledge_base to service_role;
grant select on public.knowledge_base to authenticated;
