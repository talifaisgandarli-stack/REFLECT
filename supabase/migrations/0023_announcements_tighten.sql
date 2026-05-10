-- PRD §10.6 — announcements are admin-published (approval queue covers
-- MIRAI-suggested posts). Original `ann_insert` allowed any authenticated
-- caller to post directly, bypassing approval. Restrict to admin.

drop policy if exists ann_insert on announcements;
create policy ann_insert on announcements
  for insert with check (is_admin());
