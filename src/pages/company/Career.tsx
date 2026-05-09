/**
 * §9.2 Karyera Strukturu — career_levels table; admin edits, users see promotion path.
 * Schema seeded by migration 0010 with Junior/Mid/Senior/Principal levels.
 */
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useCareerLevels } from '@/lib/hooks';

type Level = {
  id: string;
  name: string;
  level_index: number;
  description: string | null;
  requirements: string[];
};

export function CareerPage() {
  const q = useCareerLevels();
  const levels = ((q.data ?? []) as Level[]).slice().sort((a, b) => a.level_index - b.level_index);

  return (
    <>
      <PageHead meta="Promosyon yolu" title="Karyera Strukturu" />
      {levels.length === 0 ? (
        <EmptyState
          title="Səviyyələr yüklənmədi"
          body="Migration 0010 işlədikdən sonra Junior/Mid/Senior/Principal səviyyələri görünəcək."
        />
      ) : (
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {levels.map((l, i) => {
            const next = levels[i + 1];
            return (
              <li key={l.id} className="card">
                <div
                  className="text-meta uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Səviyyə {l.level_index}
                </div>
                <h3 className="text-h3 mt-1">{l.name}</h3>
                {l.description ? (
                  <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
                    {l.description}
                  </p>
                ) : null}
                {l.requirements.length > 0 ? (
                  <ul
                    className="mt-3 text-meta space-y-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {l.requirements.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                ) : null}
                {next ? (
                  <div
                    className="text-meta mt-3"
                    style={{ color: 'var(--brand-text)' }}
                  >
                    → Növbəti: {next.name}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
