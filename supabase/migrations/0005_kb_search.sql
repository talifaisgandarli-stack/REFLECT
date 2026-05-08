-- MIRAI RAG retrieval — PRD §7.4
-- Cosine top-k over knowledge_base.embedding. SECURITY DEFINER so RLS
-- (kb_select) still gates row visibility based on auth.role().

create or replace function public.match_knowledge_base(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  source_pdf text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    kb.id,
    kb.source_pdf,
    kb.chunk_index,
    kb.content,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where kb.embedding is not null
  order by kb.embedding <=> query_embedding
  limit match_count;
$$;

-- ANN index for the cosine operator. ivfflat needs lists tuned to row count;
-- 100 is a sane starting point for ≤100k rows. PRD §10 forbids dropping data,
-- not indexes — this index is safe to recreate later.
create index if not exists knowledge_base_embedding_idx
  on knowledge_base
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
