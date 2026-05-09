-- ICP inputs hash — REQ-CRM-04.
-- "cached `ai_icp_fit` until inputs change" — we hash the relevant input
-- fields and store it so /api/mirai/icp can detect input drift cheaply.
alter table clients
  add column if not exists ai_icp_inputs_hash text;
