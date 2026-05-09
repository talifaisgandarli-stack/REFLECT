-- PRD §7.4: pgvector cosine similarity search over knowledge_base.
-- Used by /api/mirai/chat when persona.useRag = true (e.g. Hüquqşünas).
-- Requires pgvector extension (already enabled in 0001 via `create extension if not exists vector`).

create or replace function match_knowledge_base(
  query_embedding vector(1536),
  match_count     int default 5
)
returns table (
  id          uuid,
  source_pdf  text,
  chunk_index int,
  content     text,
  similarity  float
)
language sql stable security definer
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

-- Only authenticated users can call this function (RLS on knowledge_base
-- already enforces authenticated-only SELECT via policy kb_select in 0002).
revoke all on function match_knowledge_base(vector, int) from public;
grant execute on function match_knowledge_base(vector, int) to authenticated;
