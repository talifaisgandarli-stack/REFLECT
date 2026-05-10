drop policy if exists cc_write on closeout_checklists;
alter table closeout_checklists drop constraint if exists closeout_checklists_project_id_key;
