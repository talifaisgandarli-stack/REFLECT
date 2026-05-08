-- US-FIN-08 — invoice generator with fiscal-year auto-increment.
-- PRD §3.2 has no invoice_counters table; adding it here as a schema decision
-- (logged in commit per prd-guard rule 5). PRD §3.2 should be amended.

create table if not exists invoice_counters (
  year      int  primary key,
  last_seq  int  not null default 0,
  updated_at timestamptz not null default now()
);

alter table invoice_counters enable row level security;
create policy ic_admin_all on invoice_counters for all
  using (is_admin()) with check (is_admin());

-- Atomic generator. Bumps the per-year counter, formats AZ-YYYY-NNNN, inserts
-- a project_documents row (source='auto_generated', share_token, category=
-- 'Faktura'), returns id + invoice_number + share_token.
create or replace function public.generate_invoice(
  p_project_id uuid,
  p_client_id  uuid,
  p_title      text,    -- optional human label; falls back to invoice_number
  p_category   text default 'Faktura'
)
returns table (
  document_id    uuid,
  invoice_number text,
  share_token    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Baku'))::int;
  v_seq  int;
  v_inv  text;
  v_token text;
  v_doc  uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  -- Atomic counter bump (Asia/Baku year per REQ-FIN-09).
  insert into invoice_counters (year, last_seq)
    values (v_year, 1)
  on conflict (year) do update
    set last_seq = invoice_counters.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;

  v_inv := 'AZ-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
  v_token := encode(gen_random_bytes(18), 'hex');

  insert into project_documents (
    project_id, client_id, category, title, source, share_token, created_by
  ) values (
    p_project_id,
    p_client_id,
    coalesce(p_category, 'Faktura'),
    coalesce(nullif(btrim(p_title), ''), v_inv),
    'auto_generated',
    v_token,
    auth.uid()
  )
  returning id into v_doc;

  document_id    := v_doc;
  invoice_number := v_inv;
  share_token    := v_token;
  return next;
end;
$$;

grant execute on function public.generate_invoice(uuid, uuid, text, text) to authenticated;
