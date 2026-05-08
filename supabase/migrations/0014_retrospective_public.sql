-- Retrospective survey public access (REQ-CRM-07).
-- Public form is reached via /share/:share_token — anonymous responder
-- needs to (a) read the row by token to render the form, (b) update the
-- same row with their NPS + ratings + comment + responded_at.
--
-- We grant these via a security-definer RPC pair so policies stay strict.

create or replace function public.retrospective_get(p_token text)
returns table (
  id uuid,
  project_id uuid,
  client_id uuid,
  share_token text,
  sent_at timestamptz,
  responded_at timestamptz,
  nps_score int,
  ratings jsonb,
  comment text
) language sql security definer set search_path = public
as $$
  select id, project_id, client_id, share_token, sent_at, responded_at,
         nps_score, ratings, comment
    from retrospective_surveys
   where share_token = p_token
   limit 1;
$$;

create or replace function public.retrospective_submit(
  p_token text,
  p_nps int,
  p_ratings jsonb,
  p_comment text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur retrospective_surveys%rowtype;
begin
  if p_nps is null or p_nps < 0 or p_nps > 10 then
    raise exception 'nps_out_of_range' using errcode = 'check_violation';
  end if;
  select * into cur from retrospective_surveys where share_token = p_token;
  if not found then
    raise exception 'survey_not_found';
  end if;
  if cur.responded_at is not null then
    raise exception 'survey_already_submitted';
  end if;
  update retrospective_surveys
     set nps_score = p_nps,
         ratings = coalesce(p_ratings, '{}'::jsonb),
         comment = nullif(btrim(coalesce(p_comment, '')), ''),
         responded_at = now()
   where id = cur.id;
end;
$$;

revoke all on function public.retrospective_get(text) from public;
revoke all on function public.retrospective_submit(text, int, jsonb, text) from public;
grant execute on function public.retrospective_get(text) to anon, authenticated;
grant execute on function public.retrospective_submit(text, int, jsonb, text) to anon, authenticated;

-- Send helper used by Closeout flow / admin: generates a share_token,
-- stamps sent_at, returns the token so the UI can build the public URL.
create or replace function public.retrospective_send(
  p_project_id uuid
) returns text
language plpgsql security definer set search_path = public as $$
declare
  tok text := encode(gen_random_bytes(18), 'base64');
  client uuid;
  survey_id uuid;
begin
  if not (is_admin() or exists (
    select 1 from projects where id = p_project_id and created_by = auth.uid()
  )) then
    raise exception 'send_forbidden' using errcode = '42501';
  end if;
  -- urlsafe base64
  tok := translate(tok, '+/=', '-_ ');
  tok := replace(tok, ' ', '');
  select client_id into client from projects where id = p_project_id;

  insert into retrospective_surveys (project_id, client_id, share_token, sent_at)
  values (p_project_id, client, tok, now())
  returning id into survey_id;
  return tok;
end;
$$;

revoke all on function public.retrospective_send(uuid) from public;
grant execute on function public.retrospective_send(uuid) to authenticated;
