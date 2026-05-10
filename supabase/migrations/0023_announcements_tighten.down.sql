drop policy if exists ann_insert on announcements;
create policy ann_insert on announcements for insert with check (auth.role() = 'authenticated');
