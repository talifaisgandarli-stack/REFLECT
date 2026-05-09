drop policy if exists pd_storage_select on storage.objects;
drop policy if exists pd_storage_insert on storage.objects;
drop policy if exists pd_storage_delete on storage.objects;
-- Bucket kept (PRD §10.2 — never drop user data).
