-- Knowledge base search (PRD §7.4 RAG).
-- Cosine similarity (pgvector <=> operator) with admin-only RLS read.
-- The function is SECURITY DEFINER + admin-gated so it can be called
-- by MIRAI's userClient when the caller is admin; non-admins are
-- refused at the function body.

create or replace function public.search_knowledge_base(
  p_embedding vector,
  p_limit int default 5
) returns table (
  id uuid,
  source_pdf text,
  chunk_index int,
  content text,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'kb_search_admin_only' using errcode = '42501';
  end if;
  if p_limit > 20 then p_limit := 20; end if;
  return query
    select kb.id,
           kb.source_pdf,
           kb.chunk_index,
           kb.content,
           1 - (kb.embedding <=> p_embedding) as similarity
      from knowledge_base kb
     where kb.embedding is not null
     order by kb.embedding <=> p_embedding
     limit p_limit;
end;
$$;

revoke all on function public.search_knowledge_base(vector, int) from public;
grant execute on function public.search_knowledge_base(vector, int) to authenticated;

-- IVF index speeds up cosine search at the cost of a recall hit; safe
-- default for a few-thousand-row corpus.
create index if not exists idx_knowledge_embedding
  on knowledge_base using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);
