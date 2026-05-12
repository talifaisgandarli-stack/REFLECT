-- Templates (invoice/contract bodies) can contain pricing terms, vendor
-- rates, and other commercial info. PRD §16 / audit-cross-cutting flags
-- non-admin SELECT as a leak risk. Tighten to admin-only.

drop policy if exists templates_select on templates;
create policy templates_select on templates for select using (is_admin());
