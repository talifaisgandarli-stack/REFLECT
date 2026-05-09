/**
 * Performans — PRD §8.3 / Module 8.3
 * performance_reviews (id, employee_id, year, score, ratings jsonb, reviewer_id, summary)
 * User sees self; admin sees all. Activates from year 2026.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import type { PerformanceReview, Profile } from '@/types/db';

type ReviewRow = PerformanceReview & { employee?: Pick<Profile, 'id' | 'full_name' | 'email'> };

const RATING_CATEGORIES = [
  'Tapşırıq tamamlanması',
  'Vaxtında çatdırma',
  'Komanda işbirliyi',
  'Ünsiyyət keyfiyyəti',
  'Texniki bacarıq',
] as const;

const CURRENT_YEAR = new Date().getFullYear();

export function PerformancePage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  const reviews = useQuery({
    queryKey: ['performance-reviews', isAdmin, selectedYear],
    queryFn: async (): Promise<ReviewRow[]> => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from('performance_reviews')
          .select('*, employee:profiles(id, full_name, email)')
          .eq('year', selectedYear)
          .order('score', { ascending: false });
        if (error) throw error;
        return (data ?? []) as ReviewRow[];
      }
      const { data, error } = await supabase
        .from('performance_reviews')
        .select('*')
        .eq('employee_id', profile!.id)
        .order('year', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
    enabled: !!profile?.id,
  });

  const profiles = useQuery({
    queryKey: ['profiles-list'],
    enabled: isAdmin,
    queryFn: async (): Promise<Pick<Profile, 'id' | 'full_name' | 'email'>[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHead
        meta={isAdmin ? `${selectedYear}-ci il` : 'Öz nəticələriniz'}
        title="Performans"
        actions={
          <div className="flex items-center gap-3">
            {isAdmin && (
              <select
                className="input"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {[CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
            {isAdmin && (
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + Qiymətləndirmə
              </button>
            )}
          </div>
        }
      />

      {reviews.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (reviews.data ?? []).length === 0 ? (
        <EmptyState
          title="Performans məlumatı yoxdur"
          body={isAdmin ? 'Heyətin illik qiymətləndirməsini əlavə edin.' : 'Hələ qiymətləndirilməmisiz.'}
          cta={isAdmin ? <button className="btn-primary" onClick={() => setShowForm(true)}>+ Qiymətləndirmə</button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(reviews.data ?? []).map((r) => (
            <ReviewCard key={r.id} review={r} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {showForm && isAdmin && (
        <AddReviewModal
          profiles={profiles.data ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['performance-reviews'] });
            setShowForm(false);
          }}
          reviewerId={profile!.id}
          year={selectedYear}
        />
      )}
    </>
  );
}

function ReviewCard({ review, isAdmin }: { review: ReviewRow; isAdmin: boolean }) {
  const pct = Math.min(100, Math.max(0, review.score));
  const circumference = 2 * Math.PI * 44;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="card flex gap-5 items-start">
      <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
        <svg width={100} height={100} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke="var(--brand-action)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-h3 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(pct)}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {isAdmin && (
          <div className="font-medium text-body">
            {review.employee?.full_name ?? review.employee?.email ?? review.employee_id.slice(0, 8)}
          </div>
        )}
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {review.year}-ci il
        </div>
        {review.summary ? (
          <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>{review.summary}</p>
        ) : null}
      </div>
    </div>
  );
}

type AddProps = {
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'>[];
  onClose: () => void;
  onSaved: () => void;
  reviewerId: string;
  year: number;
};

function AddReviewModal({ profiles, onClose, onSaved, reviewerId, year }: AddProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>(
    Object.fromEntries(RATING_CATEGORIES.map((c) => [c, 3])),
  );
  const [summary, setSummary] = useState('');

  const score = Math.round(
    (Object.values(ratings).reduce((s, v) => s + v, 0) / (RATING_CATEGORIES.length * 5)) * 100,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('İşçi seçin');
      const { error } = await supabase.from('performance_reviews').upsert({
        employee_id: employeeId,
        year,
        score,
        ratings,
        reviewer_id: reviewerId,
        summary: summary.trim() || null,
      }, { onConflict: 'employee_id,year' });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <div
      role="dialog"
      aria-label="Performans qiymətləndirməsi"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      >
        <h2 className="text-h2 mb-4">Qiymətləndirmə — {year}</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İşçi *</span>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">Seçin…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </select>
          </label>

          {RATING_CATEGORIES.map((cat) => (
            <label key={cat} className="block">
              <span className="text-meta flex justify-between mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>{cat}</span>
                <span>{ratings[cat]}/5</span>
              </span>
              <input
                type="range" min={1} max={5} step={1}
                value={ratings[cat]}
                onChange={(e) => setRatings((r) => ({ ...r, [cat]: Number(e.target.value) }))}
              />
            </label>
          ))}

          <div
            className="text-meta px-3 py-2 rounded-btn text-center"
            style={{ background: 'var(--brand-mist)', color: 'var(--brand-text)' }}
          >
            Ümumi bal: <strong>{score}</strong>/100
          </div>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Xülasə (könüllü)</span>
            <textarea className="input" value={summary} onChange={(e) => setSummary(e.target.value)} style={{ minHeight: 72 }} />
          </label>
        </div>

        {save.error ? <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p> : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>Geri</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !employeeId}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </form>
    </div>
  );
}
