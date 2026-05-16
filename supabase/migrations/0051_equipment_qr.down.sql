-- 0051 down — PRD §10.2: rename, never drop.

drop index if exists equipment_qr_code_idx;

alter table equipment rename column qr_code to _deprecated_qr_code;
