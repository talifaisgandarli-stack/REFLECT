import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { usePerformanceReviews } from '@/lib/hooks';
import { EmptyState } from '@/components/EmptyState';
import type { PerformanceReview } from '@/types/db';

/**
 * REQ-Komanda 8.3 / US-PERF-01.
 * Activates from year 2026 onward (DB CHECK constraint enforces).
 * RLS: user sees self all years; admin sees all.
 */
export function PerformancePage() {
  const { isAdmin, profile } = useAuth();
  const { data: rows = [], isLoading } = usePerformanceReviews(
    isAdmin ? undefined : profile?.id,
  );

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.year));
    return [...set].sort((a, b) => b - a);
  }, [rows]);
  const [year, setYear] = useState<number | null>(null);
  const activeYear = year ?? years[0] ?? null;

  const visible = useMemo(
    () => (activeYear == null ? rows : rows.filter((r) => r.year === activeYear)),
    [rows, activeYear],
  );

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Sizin göstəriciləriniz'}
        title="Performans"
      />

      {years.length > 1 ? (
        <div className="flex gap-2 mb-4">
          {years.map((y) => (
            <button
              key={y}
              className={`chip ${activeYear === y ? 'chip-brand' : ''}`}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Performans qiymətləri yoxdur"
          body="Performance göstəriciləri 2026-cı ildən etibarən aktivdir. Admin illik baxış qoyandan sonra burada görünəcək."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((r) => (
            <GaugeCard key={r.id} review={r} showEmployee={isAdmin} />
          ))}
        </div>
      )}
    </>
  );
}

function GaugeCard({ review, showEmployee }: { review: PerformanceReview; showEmployee: boolean }) {
  const tone = scoreTone(review.score);
  return (
    <div className="card flex items-center gap-5">
      <Gauge score={review.score} stroke={tone.color} />
      <div className="min-w-0">
        <div className="text-tiny uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {review.year}
        </div>
        <h3 className="text-h3" style={{ color: tone.color }}>
          {tone.label}
        </h3>
        {showEmployee ? (
          <div className="text-meta font-mono" style={{ color: 'var(--text-muted)' }}>
            {review.employee_id.slice(0, 8)}
          </div>
        ) : null}
        {review.summary ? (
          <p className="text-body mt-2 line-clamp-3">{review.summary}</p>
        ) : null}
        {Object.keys(review.ratings ?? {}).length > 0 ? (
          <ul className="text-meta mt-2 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
            {Object.entries(review.ratings).slice(0, 4).map(([k, v]) => (
              <li key={k}>
                {k}: <strong>{Number(v)}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function Gauge({ score, stroke }: { score: number; stroke: string }) {
  const r = 56;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div style={{ position: 'relative', width: 132, height: 132 }}>
      <svg width={132} height={132} viewBox="0 0 132 132">
        <circle cx={66} cy={66} r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx={66}
          cy={66}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center text-h2"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {Math.round(score)}
      </div>
    </div>
  );
}

function scoreTone(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Möhtəşəm', color: 'var(--brand-text)' };
  if (score >= 60) return { label: 'Yaxşı temp', color: '#D97706' };
  if (score >= 40) return { label: 'İnkişaf etdir', color: '#92400E' };
  return { label: 'Risk', color: '#B91C1C' };
}
