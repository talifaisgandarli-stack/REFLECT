-- Swap embedding provider: OpenAI text-embedding-ada-002 (1536 dim) →
-- Google Gemini text-embedding-004 (768 dim, free tier 1500 RPD).
-- We drop any existing rows because old 1536-dim vectors are incompatible.
-- Knowledge base is admin-curated; re-uploading PDFs after this migration
-- is the expected workflow.

delete from knowledge_base;

alter table knowledge_base drop column if exists embedding;
alter table knowledge_base add column embedding vector(768);

-- Replace the RPC with the new dimension signature.
drop function if exists match_knowledge_base(vector, int);

create or replace function match_knowledge_base(
  query_embedding vector(768),
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
