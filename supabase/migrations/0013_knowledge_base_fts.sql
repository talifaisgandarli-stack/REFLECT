-- Knowledge base full-text search index — PRD §7.4 RAG.
--
-- PRD §7.4 specifies pgvector cosine similarity, but the approved tech stack
-- (PRD §3.1) includes only the Anthropic SDK — no embedding model is specified.
-- knowledge_base.embedding is vector(1536), which is OpenAI ada-002 dimensionality.
-- Until an embedding provider is selected, we add a tsvector column for
-- PostgreSQL full-text search so the RAG pipeline can return relevant chunks.
-- When embeddings are available, replace the FTS lookup with a cosine search.

alter table knowledge_base
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists idx_kb_content_tsv
  on knowledge_base using gin(content_tsv);
