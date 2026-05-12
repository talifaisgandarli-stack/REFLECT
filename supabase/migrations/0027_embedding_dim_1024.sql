-- Switch embedding provider from Gemini (768 dim, restrictive free tier) to
-- Voyage AI voyage-3.5-lite (1024 dim, 200M token free trial — Anthropic's
-- recommended provider). Clear existing rows because dim mismatch breaks all
-- prior embeddings; admins re-upload PDFs after this.

delete from knowledge_base;

alter table knowledge_base drop column if exists embedding;
alter table knowledge_base add column embedding vector(1024);

drop function if exists match_knowledge_base(vector, int);

create or replace function match_knowledge_base(
  query_embedding vector(1024),
  match_count int default 5
)
returns table (
  source_pdf text,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    kb.source_pdf,
    kb.chunk_index,
    kb.content,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where kb.embedding is not null
  order by kb.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function match_knowledge_base(vector, int) from public;
grant execute on function match_knowledge_base(vector, int) to authenticated, service_role;
