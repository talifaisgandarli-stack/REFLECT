import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';

export function LeavePage() {
  return (
    <>
      <PageHead meta="Cari il" title="Məzuniyyət" actions={<button className="btn-primary">+ Müraciət</button>} />
      <EmptyState title="Açıq məzuniyyət müraciəti yoxdur" body="Yaxınlaşan istirahət — burada planlaşdır." />
    </>
  );
}
