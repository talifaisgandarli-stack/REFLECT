import { PageHead } from '@/components/PageHead';

const LEVELS = [
  { key: 'junior', label: 'Junior', desc: 'Yeni qoşulanlar, mentor altında' },
  { key: 'mid', label: 'Mid', desc: 'Müstəqil layihə paketləri' },
  { key: 'senior', label: 'Senior', desc: 'Layihə rəhbərliyi, ekspertiza' },
  { key: 'principal', label: 'Principal', desc: 'Strateji qərarlar, müştəri əlaqələri' },
];

export function CareerPage() {
  return (
    <>
      <PageHead meta="Promosyon yolu" title="Karyera Strukturu" />
      <ol className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {LEVELS.map((l, i) => (
          <li key={l.key} className="card">
            <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Səviyyə {i + 1}
            </div>
            <h3 className="text-h3 mt-1">{l.label}</h3>
            <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
              {l.desc}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
