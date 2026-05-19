-- 0046 down — PRD §10.2: rename, never drop.

drop index if exists tasks_labels_idx;

alter table tasks
  rename column labels to _deprecated_labels;
