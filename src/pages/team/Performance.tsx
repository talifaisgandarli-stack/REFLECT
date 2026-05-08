import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import {
  useActiveProfiles,
  usePerformanceReviews,
  useSubmitPerformanceReview,
} from '@/lib/hooks';
import { EmptyState } from '@/components/EmptyState';
import type { PerformanceReview, Profile } from '@/types/db';

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
  const [editing, setEditing] = useState(false);

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
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setEditing(true)}>
              + Baxış
            </button>
          ) : null
        }
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

      {editing ? <ReviewModal onClose={() => setEditing(false)} /> : null}
    </>
  );
}

const RATING_KEYS = ['delivery', 'quality', 'collaboration', 'growth'] as const;
const RATING_LABEL: Record<(typeof RATING_KEYS)[number], string> = {
  delivery: 'Təhvil',
  quality: 'Keyfiyyət',
  collaboration: 'Komanda işi',
  growth: 'İnkişaf',
};

function ReviewModal({ onClose }: { onClose: () => void }) {
  const submit = useSubmitPerformanceReview();
  const { data: people = [] } = useActiveProfiles();
  const [employeeId, setEmployeeId] = useState<string>(people[0]?.id ?? '');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [score, setScore] = useState<string>('');
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function handle() {
    setErr(null);
    const s = Number(score);
    if (!employeeId) return setErr('İşçi seç.');
    if (year < 2026) return setErr('İl 2026 və sonra olmalıdır.');
    if (!Number.isFinite(s) || s < 0 || s > 100) return setErr('Bal 0–100 aralığında olmalıdır.');

    const numericRatings: Record<string, number> = {};
    for (const k of RATING_KEYS) {
      const n = Number(ratings[k]);
      if (Number.isFinite(n) && n >= 0 && n <= 5) numericRatings[k] = n;
    }

    submit.mutate(
      {
        employee_id: employeeId,
        year,
        score: s,
        ratings: numericRatings,
        summary: summary.trim() || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  useEffect(() => {
    if (!employeeId && people.length > 0) setEmployeeId(people[0].id);
  }, [employeeId, people]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-1">+ Performans baxışı</h2>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          Eyni il üçün təkrar göndərmə cari qiyməti yeniləyəcək.
        </p>
        <PField label="İşçi">
          <select
            className="input w-full"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {(people as Profile[]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </PField>
        <PField label="İl">
          <input
            className="input w-full"
            type="number"
            min={2026}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </PField>
        <PField label="Ümumi bal (0–100)">
          <input
            className="input w-full"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </PField>
        <div className="mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Kateqoriyalar (0–5)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {RATING_KEYS.map((k) => (
              <label key={k} className="block">
                <div className="text-meta mb-1" style={{ color: 'var(--text-muted)' }}>
                  {RATING_LABEL[k]}
                </div>
                <input
                  className="input w-full"
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={ratings[k] ?? ''}
                  onChange={(e) =>
                    setRatings((p) => ({ ...p, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <PField label="Şərh">
          <textarea
            className="input w-full"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </PField>
        {err ? (
          <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
            {err}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button className="btn-primary" disabled={submit.isPending} onClick={handle}>
            {submit.isPending ? 'Yazılır…' : 'Göndər'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
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
