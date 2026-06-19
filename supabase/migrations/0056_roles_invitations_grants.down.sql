revoke select on public.roles from service_role;
revoke select on public.roles from authenticated;

revoke select, insert, update, delete on public.invitations from service_role;
revoke select, insert, update on public.invitations from authenticated;
