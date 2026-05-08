import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';

export function ContentPlanPage() {
  return (
    <>
      <PageHead
        meta="MIRAI CMO + manual"
        title="Məzmun Planlaması"
        actions={<button className="btn-primary">+ Məzmun postu</button>}
      />
      <EmptyState
        title="Məzmun cədvəli boşdur"
        body="MIRAI trend feed-dən təklif gətirəndə burada Kanban kimi görünəcək: Idea → Draft → Review → Published."
      />
    </>
  );
}
