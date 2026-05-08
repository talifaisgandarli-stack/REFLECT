import { useMemo } from 'react';
import { PageHead } from '@/components/PageHead';
import { useCareerLevels } from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import { EmptyState } from '@/components/EmptyState';
import type { CareerLevel } from '@/types/db';

/**
 * REQ-Komanda 9.2 / US-CAREER-01.
 * Reads career_levels (any authenticated). Shows current + next per the
 * user's profile.career_level_id; admin sees the whole ladder.
 *
 * Auto-evaluation of "criteria already met" against tasks/projects is future
 * work — for now requirements render as a static checklist.
 */
export function CareerPage() {
  const { profile } = useAuth();
  const { data: levels = [], isLoading } = useCareerLevels();

  const current = useMemo(
    () => levels.find((l) => l.id === profile?.career_level_id) ?? null,
    [levels, profile?.career_level_id],
  );
  const next = useMemo(
    () =>
      current
        ? levels.find((l) => l.level_index === current.level_index + 1) ?? null
        : levels[0] ?? null,
    [levels, current],
  );

  return (
    <>
      <PageHead meta="Promosyon yolu" title="Karyera Strukturu" />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : levels.length === 0 ? (
        <EmptyState
          title="Karyera səviyyələri qurulmayıb"
          body="Admin Parametrlərdən karyera nərdivanı yarada bilər."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            <LevelCard
              level={current}
              fallback="Cari səviyyə təyin edilməyib"
              tag="Cari"
              tone="brand"
            />
            <LevelCard
              level={next}
              fallback="Daha yüksək səviyyə yoxdur"
              tag="Növbəti"
              tone="neutral"
            />
          </div>

          <h3 className="text-h3 mb-2">Bütün nərdivan</h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {levels.map((l) => (
              <li
                key={l.id}
                className="card"
                style={{
                  border:
                    l.id === current?.id
                      ? '2px solid var(--brand-action)'
                      : '1px solid var(--line-soft)',
                }}
              >
                <div
                  className="text-meta uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Səviyyə {l.level_index}
                </div>
                <h4 className="text-h3 mt-1">{l.name}</h4>
                <ul className="mt-2 space-y-1 text-meta">
                  {l.requirements.map((r, i) => (
                    <li key={i} style={{ color: 'var(--text-muted)' }}>
                      · {r.label}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function LevelCard({
  level,
  fallback,
  tag,
  tone,
}: {
  level: CareerLevel | null;
  fallback: string;
  tag: string;
  tone: 'brand' | 'neutral';
}) {
  const accent = tone === 'brand' ? 'var(--brand-action)' : 'var(--line)';
  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div
        className="text-tiny uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {tag}
      </div>
      {level == null ? (
        <p className="text-body mt-1" style={{ color: 'var(--text-muted)' }}>
          {fallback}
        </p>
      ) : (
        <>
          <h2 className="text-h2 mt-1">{level.name}</h2>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Səviyyə {level.level_index}
          </div>
          {level.requirements.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {level.requirements.map((r, i) => (
                <li key={i} className="text-body flex items-start gap-2">
                  <span
                    className="inline-block w-4 h-4 rounded-full shrink-0 mt-1"
                    style={{ border: '1px solid var(--line)' }}
                    aria-hidden
                  />
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
