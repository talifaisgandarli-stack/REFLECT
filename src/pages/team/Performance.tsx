/**
 * §8.3 Performans — yearly gauges, activates from 2026 onward.
 * performance_reviews table (migration 0010).
 * If no review row yet, compute a live preview score from completed-task ratio.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { usePerformanceReviews } from '@/lib/hooks';

const ACTIVE_FROM = 2026;

type Review = {
  id: string;
  employee_id: string;
  year: number;
  score: number;
  ratings: Record<string, number>;
  summary: string | null;
};

function tone(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Əla temp', color: '#22C55E' };
  if (score >= 60) return { label: 'Yaxşı temp', color: 'var(--brand-text)' };
  if (score >= 40) return { label: 'Orta', color: '#D97706' };
  return { label: 'Diqqət lazımdır', color: '#EF4444' };
}

export function PerformancePage() {
  const { profile, isAdmin } = useAuth();
  const reviews = usePerformanceReviews(isAdmin ? undefined : profile?.id);
  const livePreview = useQuery({
    queryKey: ['performance', 'live', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      // Live preview: tamamlandı vs cancelled+queued ratio for this user, current year.
      const start = new Date();
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('tasks')
        .select('status, archived_at')
        .contains('assignee_ids', [profile!.id])
        .gte('created_at', start.toISOString());
      const rows = data ?? [];
      const done = rows.filter((r: { status: string }) => r.status === 'done').length;
      const cancelled = rows.filter((r: { status: string }) => r.status === 'cancelled').length;
      const denom = rows.length || 1;
      // Score: 100 * done / total, clamped, with -10 per cancellation ratio.
      const base = (done / denom) * 100;
      const penalty = (cancelled / denom) * 30;
      return Math.max(0, Math.min(100, Math.round(base - penalty)));
    },
  });

  const items = (reviews.data ?? []) as Review[];
  const myReviews = profile?.id ? items.filter((r) => r.employee_id === profile.id) : [];
  const currentYear = new Date().getFullYear();
  const thisYearReview = myReviews.find((r) => r.year === currentYear);
  const score = thisYearReview?.score ?? livePreview.data ?? 0;
  const t = tone(score);

  return (
    <>
      <PageHead meta={`${ACTIVE_FROM}-cı il-dən aktiv`} title="Performans" />

      <div className="card flex items-center gap-6">
        <div style={{ position: 'relative', width: 160, height: 160 }}>
          <svg width={160} height={160} viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="none" stroke="var(--line)" strokeWidth="8" />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke="var(--brand-action)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 70}
              strokeDashoffset={2 * Math.PI * 70 * (1 - score / 100)}
              transform="rotate(-90 80 80)"
            />
          </svg>
          <div
            className="absolute inset-0 flex items-center justify-center text-h1"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {score}
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-h2" style={{ color: t.color }}>
            {t.label}
          </h2>
          <p className="text-body mt-1" style={{ color: 'var(--text-muted)' }}>
            {thisYearReview
              ? `${currentYear}-cı ilin admin tərəfindən təsdiqlənmiş skoru.`
              : `${currentYear} üçün canlı önbaxış: tapşırıq tamamlanma sürəti və ləğv nisbəti əsasında.`}
          </p>
          {thisYearReview?.summary ? (
            <p className="text-body mt-2">{thisYearReview.summary}</p>
          ) : null}
        </div>
      </div>

      {currentYear < ACTIVE_FROM ? (
        <div className="card mt-4 text-meta" style={{ color: 'var(--text-muted)' }}>
          Performans rəsmi olaraq {ACTIVE_FROM}-cı ildən aktiv olur.
        </div>
      ) : null}

      {myReviews.length > 0 ? (
        <div className="card mt-4">
          <h3 className="text-h3 mb-2">Tarixçə</h3>
          <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
            {myReviews
              .slice()
              .sort((a, b) => b.year - a.year)
              .map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between">
                  <span>{r.year}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: tone(r.score).color }}>
                    {r.score}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
