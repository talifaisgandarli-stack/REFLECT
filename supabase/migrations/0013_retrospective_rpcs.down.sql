drop function if exists public.submit_retrospective(text, int, jsonb, text);
drop function if exists public.get_retrospective_by_token(text);
drop function if exists public.create_retrospective(uuid);
drop policy if exists rs_admin_write on retrospective_surveys;
