/**
 * Performans (PRD §M8.3). Yearly gauges per employee.
 * Admin sees + edits everyone's reviews; user sees their own across all years.
 * Activates from 2026 forward (PRD: prior years stay empty by design).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { printSection } from '@/lib/export';
import { useT } from '@/lib/i18n';

type ReviewRow = {
  id: string;
  employee_id: string;
  year: number;
  score: number | null;
  ratings: Record<string, number>;
  reviewer_id: string | null;
  summary: string | null;
};

const RATING_KEYS = [
  { key: 'velocity', label: 'Tapşırıq sürəti' },
  { key: 'quality', label: 'İcra keyfiyyəti' },
  { key: 'collaboration', label: 'Komandayla iş' },
  { key: 'ownership', label: 'Məsuliyyət' },
] as const;

function gaugeColor(score: number): string {
  if (score >= 70) return '#22C55E';
  if (score >= 40) return 'var(--state-warn)';
  return '#EF4444';
}

function gaugeLabel(score: number): string {
  if (score >= 70) return 'On Track';
  if (score >= 40) return 'At Risk';
  return 'Off Track';
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS_AVAILABLE: number[] = (() => {
  const out: number[] = [];
  for (let y = 2026; y <= CURRENT_YEAR; y++) out.push(y);
  if (out.length === 0) out.push(2026);
  return out.reverse();
})();

export function PerformancePage() {
  const t = useT();
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [year, setYear] = useState<number>(YEARS_AVAILABLE[0]);
  const [editing, setEditing] = useState<ReviewRow | null>(null);

  const reviews = useQuery({
    queryKey: ['perf', year, isAdmin ? 'all' : profile?.id],
    queryFn: async (): Promise<ReviewRow[]> => {
      let q = supabase.from('performance_reviews').select('*').eq('year', year);
      if (!isAdmin && profile?.id) q = q.eq('employee_id', profile.id);
      const { data, error } = await q.order('score', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
  });

  const profiles = useQuery({
    queryKey: ['perf', 'profiles'],
    enabled: isAdmin,
    queryFn: async () =>
      (await supabase.from('profiles').select('id, full_name, email').order('full_name')).data ??
      [],
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { full_name: string | null; email: string }>();
    for (const p of (profiles.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string;
    }>)
      m.set(p.id, p);
    return m;
  }, [profiles.data]);

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title={t('nav.team.performance')}
        actions={
          <>
            <select
              className="input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 120 }}
            >
              {YEARS_AVAILABLE.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-outline"
              onClick={() => printSection()}
              title="Cari ilin qiymətləndirmələrini çap üçün hazırla"
              disabled={(reviews.data ?? []).length === 0}
            >
              PDF (çap)
            </button>
          </>
        }
      />

      {(reviews.data ?? []).length === 0 ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {year} ili üçün hələ qiymətləndirmə yoxdur.
          {isAdmin ? (
            <button
              type="button"
              className="btn-ghost ml-2"
              onClick={() =>
                setEditing({
                  id: '',
                  employee_id: profile?.id ?? '',
                  year,
                  score: 50,
                  ratings: {},
                  reviewer_id: null,
                  summary: null,
                })
              }
              style={{ color: 'var(--brand-text)', height: 28 }}
            >
              + Qiymətləndirmə əlavə et
            </button>
          ) : null}
        </div>
      ) : (
        <div
          data-print-root
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {(reviews.data ?? []).map((r) => {
            const p = profileMap.get(r.employee_id);
            const score = r.score ?? 0;
            const color = gaugeColor(score);
            const dash = 2 * Math.PI * 56;
            return (
              <article key={r.id} className="card">
                <div className="flex items-center gap-4">
                  <div style={{ position: 'relative', width: 128, height: 128 }}>
                    <svg width={128} height={128} viewBox="0 0 128 128">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="var(--line)"
                        strokeWidth="6"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke={color}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={dash}
                        strokeDashoffset={dash * (1 - score / 100)}
                        transform="rotate(-90 64 64)"
                      />
                    </svg>
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      <span className="text-h1" style={{ color: 'var(--text)' }}>
                        {score}
                      </span>
                      <span className="text-meta" style={{ color }}>
                        {gaugeLabel(score)}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-h4 truncate">
                      {p?.full_name || p?.email || r.employee_id.slice(0, 8)}
                    </div>
                    {r.summary ? (
                      <p
                        className="text-meta mt-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {r.summary}
                      </p>
                    ) : null}
                    {isAdmin ? (
                      <button
                        type="button"
                        className="btn-ghost mt-2"
                        onClick={() => setEditing(r)}
                        style={{ height: 32, padding: '0 12px' }}
                      >
                        Düzəlt
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && isAdmin ? (
        <ReviewModal
          review={editing}
          profiles={
            (profiles.data ?? []) as Array<{
              id: string;
              full_name: string | null;
              email: string;
            }>
          }
          onClose={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['perf'] });
          }}
        />
      ) : null}
    </>
  );
}

function ReviewModal({
  review,
  profiles,
  onClose,
}: {
  review: ReviewRow;
  profiles: Array<{ id: string; full_name: string | null; email: string }>;
  onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(review.employee_id);
  const [score, setScore] = useState<number>(review.score ?? 50);
  const [ratings, setRatings] = useState<Record<string, number>>(review.ratings ?? {});
  const [summary, setSummary] = useState(review.summary ?? '');

  const save = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('İşçi seçin');
      const payload = {
        employee_id: employeeId,
        year: review.year,
        score,
        ratings,
        summary: summary || null,
      };
      if (review.id) {
        const { error } = await supabase
          .from('performance_reviews')
          .update(payload)
          .eq('id', review.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('performance_reviews')
          .upsert(payload, { onConflict: 'employee_id,year' });
        if (error) throw error;
      }
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Qiymətləndirmə"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{review.id ? 'Düzəlt' : 'Yeni'} — {review.year}</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              İşçi
            </span>
            <select
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!!review.id}
            >
              <option value="">— seçin —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-meta flex justify-between mb-1" style={{ color: 'var(--text-muted)' }}>
              Ümumi xal
              <span style={{ color: gaugeColor(score), fontVariantNumeric: 'tabular-nums' }}>
                {score} ({gaugeLabel(score)})
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full"
            />
          </label>

          {RATING_KEYS.map((rk) => (
            <label key={rk.key} className="block">
              <span className="text-meta flex justify-between mb-1" style={{ color: 'var(--text-muted)' }}>
                {rk.label}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ratings[rk.key] ?? 3}</span>
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={ratings[rk.key] ?? 3}
                onChange={(e) =>
                  setRatings((prev) => ({ ...prev, [rk.key]: Number(e.target.value) }))
                }
                className="w-full"
              />
            </label>
          ))}

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Xülasə
            </span>
            <textarea
              className="input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ minHeight: 88, padding: '12px 14px' }}
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !employeeId}>
            {save.isPending ? 'Yadda saxlanılır…' : 'Yadda saxla'}
          </button>
        </div>
      </form>
    </div>
  );
}
