-- Table-level GRANTs for push_subscriptions.
--
-- push_subscriptions was created manually in the SQL editor (migration 0090),
-- so the `authenticated` and `service_role` roles never received table
-- privileges — RLS policies gate *rows*, but a role still needs a table GRANT
-- to touch the table at all. Without this, /api/push/subscribe (which writes
-- with the caller's own JWT → `authenticated` role) fails with
-- "permission denied for table push_subscriptions", and /api/push/notify
-- (service role) can't read subscriptions to deliver pushes.
--
-- authenticated: users manage their own rows (rows gated by RLS policy push_self).
-- service_role:  notify.ts reads all subscriptions to send OS-level pushes.

grant select, insert, update, delete on push_subscriptions to authenticated;
grant select, insert, update, delete on push_subscriptions to service_role;
