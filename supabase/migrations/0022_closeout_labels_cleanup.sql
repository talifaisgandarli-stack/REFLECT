-- Closeout checklist label normalization (slice 126, follow-up to slice 114).
--
-- Slice 114 introduced t('closeout.item.<id>') as the source of truth for
-- the 5 default checklist items. The DB still stores the AZ-only label
-- string in items[].label on every closeout_checklists row (legacy from
-- the pre-i18n implementation), which means:
--   - changing the canonical AZ wording in az.json drifts from the
--     stored copy on existing rows
--   - rows look bigger than they need to be in pg_class.relpages
--   - adding new languages duplicates the pattern
--
-- This migration trims items[*].label off every existing row, leaving
-- only { id, done, by, at }. The component already merges against
-- DEFAULT_ITEMS so the absence of label is invisible at render time.
--
-- The down() restores the AZ labels by id so a rollback to slice 114's
-- assumptions still works.

update closeout_checklists
   set items = (
     select coalesce(jsonb_agg(item - 'label'), '[]'::jsonb)
       from jsonb_array_elements(items) as item
   )
 where items is not null
   and exists (
     select 1
       from jsonb_array_elements(items) as item
      where item ? 'label'
   );
