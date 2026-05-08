-- Bilik Bazası — pgvector cosine index for fast top-K (REQ §7.4 RAG).
-- ivfflat with default lists count; tune later when row count grows.
create index if not exists idx_knowledge_base_embedding
  on knowledge_base
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Group queries hit source_pdf often (admin Bilik Bazası listing).
create index if not exists idx_knowledge_base_source on knowledge_base(source_pdf);
