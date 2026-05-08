-- PRD §7.2 / §7.4 — close persona enum gap and add cosine top-K helper.
-- The 0001 enum lists only 5 values; PRD §7.2 names 6 admin + 1 user persona
-- including "Hüquqşünas (RAG)" which is the canonical RAG persona. Adding
-- 'legal' here brings the schema in line with PRD §7.2.

alter type mirai_persona add value if not exists 'legal';

-- match_knowledge_base: cosine top-K over knowledge_base.embedding.
-- Returns content + source + similarity in [0,1] (1 = perfect match).
create or replace function public.match_knowledge_base(
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
language sql
stable
security invoker
set search_path = public
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
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_knowledge_base(vector, int) to authenticated;
