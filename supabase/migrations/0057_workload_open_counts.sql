-- Workload aggregate for the Dashboard (US-DASH-05).
-- Replaces the client-side "fetch up to 500 open tasks and count" approach,
-- which silently undercounts past the cap. Returns exact per-assignee open
-- task counts, computed in the database.
--
-- Admin-gated: the firm-wide workload view is admin-only (the widget is
-- rendered only for admins). security definer bypasses RLS to count across
-- all assignees, so the is_admin() guard is mandatory — non-admins get zero
-- rows rather than a firm-wide leak.

create or replace function public.workload_open_counts()
returns table (assignee_id uuid, open_count bigint)
language sql
security definer
set search_path = public
as $$
  select a.assignee_id, count(*)::bigint as open_count
  from tasks t
  cross join lateral unnest(t.assignee_ids) as a(assignee_id)
  where t.archived_at is null
    and t.status not in ('done', 'cancelled')
    and is_admin()
  group by a.assignee_id;
$$;

revoke all on function public.workload_open_counts() from public;
grant execute on function public.workload_open_counts() to authenticated;
