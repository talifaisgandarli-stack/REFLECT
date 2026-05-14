drop trigger if exists clients_bd_lead_expected_value on public.clients;
drop function if exists public.clients_mask_bd_lead_financials();
drop policy if exists rs_insert on retrospective_surveys;
