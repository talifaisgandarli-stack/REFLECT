import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';

export function SalaryPage() {
  const { isAdmin, profile } = useAuth();
  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title="Əmək Haqqı"
        actions={isAdmin ? <button className="btn-primary">+ Maaş cədvəli</button> : null}
      />
      <div className="card">
        <p className="text-body" style={{ color: 'var(--text-muted)' }}>
          {isAdmin
            ? 'Heyətin maaş cədvəli, bonuslar, və hesablamalar burada idarə olunur.'
            : `${profile?.full_name ?? 'Sizin'} maaş tarixi və ödəniş cədvəli.`}
        </p>
      </div>
    </>
  );
}
