-- 0051 — PRD §8.7 — equipment.qr_code text column for asset tag/QR identifier.
-- Stores a short alphanumeric tag (printed barcode/QR) so equipment can be
-- looked up from a scanner without manual ID entry. Nullable, indexed.

alter table equipment
  add column if not exists qr_code text;

create index if not exists equipment_qr_code_idx on equipment (qr_code) where qr_code is not null;
