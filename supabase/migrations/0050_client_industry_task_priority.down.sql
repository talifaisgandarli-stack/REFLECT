-- 0050 down — PRD §10.2: rename, never drop.

drop index if exists clients_industry_idx;
drop index if exists tasks_priority_idx;

alter table clients rename column industry to _deprecated_industry;
alter table tasks rename column priority to _deprecated_priority;
