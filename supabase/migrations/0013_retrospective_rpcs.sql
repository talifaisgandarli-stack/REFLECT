-- REQ-CRM-07 / US-CRM-06: retrospective survey.
-- The 0002 RLS only had SELECT for retrospective_surveys; close the gap with
-- admin INSERT/UPDATE so closeout flow can create rows. Public submission goes
-- through SECURITY DEFINER RPCs gated by share_token (no auth required).

create policy if not exists rs_admin_write on retrospective_surveys
  for all using (is_admin()) with check (is_admin());

-- Admin: open a survey for a project. Generates share_token, stamps sent_at.
create or replace function public.create_retrospective(p_project_id uuid)
returns retrospective_surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_client_id uuid;
  v_row retrospective_surveys;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  select client_id into v_client_id from projects where id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  v_token := encode(gen_random_bytes(18), 'hex');

  insert into retrospective_surveys (project_id, client_id, share_token, sent_at)
  values (p_project_id, v_client_id, v_token, now())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_retrospective(uuid) to authenticated;

-- Public: read survey context by share_token. Returns the bare minimum the
-- form needs — no PII beyond project name.
create or replace function public.get_retrospective_by_token(p_token text)
returns table (
  project_name text,
  responded boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select p.name, (rs.responded_at is not null)
      from retrospective_surveys rs
      join projects p on p.id = rs.project_id
     where rs.share_token = p_token
     limit 1;
end;
$$;

grant execute on function public.get_retrospective_by_token(text) to anon, authenticated;

-- Public: submit response. Idempotent — refuses to overwrite a prior response.
create or replace function public.submit_retrospective(
  p_token text,
  p_nps_score int,
  p_ratings jsonb,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_responded timestamptz;
begin
  if p_nps_score is null or p_nps_score < 0 or p_nps_score > 10 then
    raise exception 'nps_out_of_range' using errcode = 'P0001';
  end if;

  select id, responded_at into v_id, v_responded
    from retrospective_surveys where share_token = p_token;

  if not found then
    raise exception 'survey_not_found' using errcode = 'P0002';
  end if;
  if v_responded is not null then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;

  update retrospective_surveys
     set responded_at = now(),
         nps_score    = p_nps_score,
         ratings      = coalesce(p_ratings, '{}'::jsonb),
         comment      = p_comment
   where id = v_id;
end;
$$;

grant execute on function public.submit_retrospective(text, int, jsonb, text) to anon, authenticated;
