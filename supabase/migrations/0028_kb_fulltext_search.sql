-- Free, no-external-API knowledge base search using Postgres' built-in
-- full-text search. Drops vector embeddings entirely — every prior attempt
-- (OpenAI, Gemini, Voyage) hit rate limits on the free tier. Postgres FTS
-- runs locally, scales to millions of chunks, and is excellent for technical
-- legal docs where users search exact terms (e.g. "AZDNT 2.06", "ekspertiza").
--
-- Tradeoff: keyword match, not semantic similarity. For Reflect's job-to-be-done
-- (AZ construction norms lookup) this is good — terminology is precise and stable.

delete from knowledge_base;
alter table knowledge_base drop column if exists embedding;

-- tsvector built from chunk content; 'simple' config tokenizes without stemming,
-- which works for mixed AZ/Latin technical text better than language-specific
-- configs would.
alter table knowledge_base
  add column if not exists content_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists knowledge_base_content_tsv_idx
  on knowledge_base using gin (content_tsv);

-- Old RPC signature dropped, replaced with a text-query version.
drop function if exists match_knowledge_base(vector, int);

create or replace function match_knowledge_base(
  query_text text,
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
  with q as (
    -- websearch_to_tsquery handles natural-language input gracefully (OR/AND/quotes)
    select websearch_to_tsquery('simple', coalesce(query_text, '')) as ts
  )
  select
    kb.source_pdf,
    kb.chunk_index,
    kb.content,
    ts_rank(kb.content_tsv, q.ts)::float as similarity
  from knowledge_base kb, q
  where kb.content_tsv @@ q.ts
  order by ts_rank(kb.content_tsv, q.ts) desc
  limit greatest(1, match_count);
$$;

revoke all on function match_knowledge_base(text, int) from public;
grant execute on function match_knowledge_base(text, int) to authenticated, service_role;
