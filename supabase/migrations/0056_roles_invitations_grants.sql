-- Explicit service_role + authenticated grants for `roles` and `invitations`.
--
-- This Supabase project does NOT inherit broad service_role privileges on
-- public.* tables (see 0025_ensure_profile_rpc.sql and 0029_kb_grants.sql for
-- the precedent). Without these grants the /api/invitations/create edge
-- function fails with "permission denied for table roles" when it looks up
-- role_key → role.id via the admin() service-role client, blocking the
-- entire invite flow.
--
-- Reads only on roles (catalogue is seeded by 0001 and not mutated at
-- runtime). Full CRUD on invitations because the same handler upserts
-- the invitation row and the accept-flow updates accepted_at.

grant select on public.roles to service_role;
grant select on public.roles to authenticated;

grant select, insert, update, delete on public.invitations to service_role;
grant select, insert, update on public.invitations to authenticated;
