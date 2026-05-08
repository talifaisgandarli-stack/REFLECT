-- /d/:token public document viewer support — REQ-CRM-06 + US-FIN-08.
-- project_documents currently has admin-only writes and members-or-admin
-- SELECT. Public sharing is implemented via a SECURITY DEFINER RPC that
-- returns just the bare metadata for a given share_token. Anyone with the
-- token can view; no auth required.

create or replace function public.get_document_by_token(p_token text)
returns table (
  id            uuid,
  title         text,
  category      text,
  source        document_source,
  external_link text,
  created_at    timestamptz,
  project_name  text,
  client_name   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      d.id,
      d.title,
      d.category,
      d.source,
      d.external_link,
      d.created_at,
      p.name,
      c.name
    from project_documents d
    left join projects p on p.id = d.project_id
    left join clients  c on c.id = d.client_id
    where d.share_token = p_token
    limit 1;
end;
$$;

grant execute on function public.get_document_by_token(text) to anon, authenticated;
