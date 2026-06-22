-- Two tables had RLS enabled but were never granted table-level privileges to
-- the `authenticated` role, so PostgREST returned 403 "permission denied for
-- table" before RLS could even be evaluated:
--
--   * time_entries (0052) — the dashboard/topbar active-timer query 403'd.
--   * presence_sessions (0058) — the heartbeat now writes with the caller's own
--     JWT (not the service role), so `authenticated` must hold the grant; RLS
--     policy `ps_self` still confines each user to their own rows.
--
-- RLS remains the real access boundary (own rows only, admins via is_admin());
-- these grants only let the role reach the table at all. Idempotent.

grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.presence_sessions to authenticated;
