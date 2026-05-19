-- 0039 — REQ-PROJ-04 — let admin add per-project custom closeout checklist items.
-- PRD §3.2 schema declares `closeout_checklists.items jsonb` but the implementation
-- stores ticked labels there. We keep that semantics and add a separate
-- `custom_items text[]` column for admin-added labels beyond the default set.
-- The UI merges DEFAULT_ITEMS ∪ custom_items, persists checked state into items.
-- Additive: existing rows continue to work; custom_items defaults to '{}'.

alter table closeout_checklists
  add column if not exists custom_items text[] not null default '{}';
