-- Down: 0012. Tables renamed (PRD §10.2 — never drop user data).
drop function if exists public.leave_decide(uuid, leave_status, text);

alter table if exists salaries rename to _archived_salaries_2026;
alter table if exists leave_requests rename to _archived_leave_requests_2026;
alter table if exists performance_reviews rename to _archived_performance_reviews_2026;

drop type if exists leave_kind;
drop type if exists leave_status;
