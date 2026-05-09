drop index if exists idx_kb_content_tsv;
alter table knowledge_base drop column if exists content_tsv;
