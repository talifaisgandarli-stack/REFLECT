drop policy if exists al_select on activity_log;
create policy al_select on activity_log for select using (auth.role() = 'authenticated');
