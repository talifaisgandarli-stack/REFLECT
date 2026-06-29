-- Podrat (subcontractor) finance tracking — REQ-FIN-07 enrichment.
-- Turns the flat outsource list into a contract→paid→remaining tracker with a
-- discipline label and a lightweight milestone model (advance % + interim count
-- + final), all derivable from a single paid_amount aggregate. A separate
-- payments table was intentionally avoided for the MVP (designed for the delete).
alter table public.outsource_items
  add column if not exists discipline text,
  add column if not exists advance_pct numeric not null default 30
    check (advance_pct >= 0 and advance_pct <= 100),
  add column if not exists paid_amount numeric not null default 0
    check (paid_amount >= 0),
  add column if not exists interim_count integer not null default 0
    check (interim_count >= 0);

-- Existing fully-paid rows: their contract is settled, so Qalıq should read 0.
update public.outsource_items
  set paid_amount = amount
  where status = 'paid' and amount is not null and paid_amount = 0;

-- Member view gains the non-financial additions (discipline + company) so the
-- "Podratçı" column renders for non-admins; money columns stay admin-only.
-- New columns are APPENDED (not inserted mid-list): `create or replace view`
-- can only add columns at the end, never rename/reorder existing ones.
create or replace view public.outsource_user_view as
  select id, project_id, work_title, contact_person, deadline, status, responsible_user_id,
         contact_company, discipline
  from public.outsource_items;
grant select on public.outsource_user_view to authenticated;
