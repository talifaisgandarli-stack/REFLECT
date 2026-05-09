-- Restore items[*].label by id mapping. Only id values that match the
-- 5 PRD-spec defaults get rebuilt; custom ids (none expected in v1) are
-- left without a label, which still merges correctly against
-- DEFAULT_ITEMS in the component.
update closeout_checklists
   set items = (
     select coalesce(
       jsonb_agg(
         case (item ->> 'id')
           when 'act_signed'   then item || jsonb_build_object('label', 'Akt imzalandı')
           when 'final_docs'   then item || jsonb_build_object('label', 'Final sənədlər təhvil verildi')
           when 'archived'     then item || jsonb_build_object('label', 'Arxivə köçürüldü')
           when 'portfolio_set'then item || jsonb_build_object('label', 'Portfolio üçün ayrıldı')
           when 'retro_sent'   then item || jsonb_build_object('label', 'Retrospektiv sorğu göndərildi')
           else item
         end
       ),
       '[]'::jsonb
     )
       from jsonb_array_elements(items) as item
   )
 where items is not null;
