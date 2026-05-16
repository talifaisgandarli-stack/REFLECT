/**
 * PRD §8.3 — US-PERF-01/02
 * performance_reviews (id, employee_id, year, score, ratings jsonb, reviewer_id, summary)
 * User sees own reviews for all years; admin sees all + can author reviews.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type Review = {
  id: string;
  employee_id: string;
  year: number;
  score: number;
  ratings: Record<string, number>;
  reviewer_id: string | null;
  summary: string | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
};

const RATING_KEYS = [
  { key: 'quality', label: 'Keyfiyyət' },
  { key: 'speed', label: 'Sürət' },
  { key: 'teamwork', label: 'Komanda işi' },
  { key: 'initiative', label: 'Təşəbbüs' },
];

function Gauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const r = 70;
  const circ = 2 * Math.PI * r;
  const color = pct >= 70 ? 'var(--brand-action)' : pct >= 40 ? 'var(--warning)' : 'var(--error)';
  return (
    <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-h1" style={{ fontVariantNumeric: 'tabular-nums' }}>{score}</span>
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>/100</span>
      </div>
    </div>
  );
}

export function PerformancePage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteReview = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('performance_reviews').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['performance_reviews'] });
      setConfirmDeleteId(null);
    },
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-perf'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[];
    },
    enabled: !!isAdmin,
  });

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['performance_reviews', year, isAdmin ? 'all' : profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('performance_reviews')
        .select('*, profiles(full_name, avatar_url)')
        .eq('year', year);
      if (!isAdmin) q = q.eq('employee_id', profile!.id);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
    enabled: !!profile,
  });

  // PRD §8.3 — Performance activates from 2026 onward, but past-year reviews
  // must remain accessible. Show every year from 2026 through max(currentYear,
  // currentYear+1) so users can navigate forward (next-year planning) AND
  // backward across all historical reviews.
  const years = (() => {
    const start = 2026;
    const end = Math.max(currentYear + 1, start);
    const out: number[] = [];
    for (let y = end; y >= start; y--) out.push(y);
    return out;
  })();

  // PRD §8.3 — print-friendly single-page review (browser print → Save as PDF)
  function printReview(rev: Review) {
    const w = window.open('', '_blank', 'width=820,height=1100');
    if (!w) return;
    const ratingsRows = RATING_KEYS
      .map((rk) => {
        const v = (rev.ratings as Record<string, number>)?.[rk.key] ?? 0;
        return `<tr><td>${rk.label}</td><td style="text-align:right">${v} / 5</td></tr>`;
      })
      .join('');
    const employee = rev.profiles?.full_name ?? 'İşçi';
    w.document.write(`<!doctype html>
<html lang="az"><head><meta charset="utf-8"/>
<title>Performans · ${employee} · ${rev.year}</title>
<style>
  @page { size: A4; margin: 24mm; }
  body { font-family: Inter, system-ui, sans-serif; color: #0E1611; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #6b7165; font-size: 13px; margin-bottom: 24px; }
  .score-card { border: 1px solid #d6dad3; border-radius: 12px; padding: 18px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .score-card .big { font-size: 56px; font-weight: 700; color: ${rev.score >= 70 ? '#16794a' : rev.score >= 40 ? '#c47d00' : '#b3261e'}; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  td { padding: 8px 0; border-bottom: 1px solid #eef0eb; }
  td:first-child { color: #6b7165; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7165; margin: 24px 0 8px; }
  .summary { white-space: pre-wrap; padding: 12px; background: #f5f7f3; border-radius: 8px; font-size: 14px; }
  .footer { margin-top: 40px; font-size: 11px; color: #9ca39c; }
</style></head><body>
  <h1>Performans qiymətləndirməsi</h1>
  <div class="meta">${employee} · ${rev.year}-ci il · Yaradıldı: ${new Date(rev.created_at).toLocaleDateString('az-AZ')}</div>
  <div class="score-card">
    <div>
      <div style="font-size:13px;color:#6b7165;text-transform:uppercase;letter-spacing:0.06em">Ümumi bal</div>
      <div class="big">${rev.score} <span style="font-size:18px;color:#9ca39c;font-weight:400">/100</span></div>
    </div>
  </div>
  <h2>Kateqoriya reytinqləri</h2>
  <table>${ratingsRows}</table>
  ${rev.summary ? `<h2>Xülasə</h2><div class="summary">${rev.summary.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))}</div>` : ''}
  <div class="footer">Reflect Architects OS · ${new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}</div>
  <script>setTimeout(() => window.print(), 100);</script>
</body></html>`);
    w.document.close();
  }

  return (
    <>
      <PageHead
        meta={`${year}-ci il`}
        title="Performans"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              + Qiymətləndirmə
            </button>
          ) : null
        }
      />

      <div className="flex gap-2 mb-5 flex-wrap">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className="chip"
            style={{
              background: year === y ? 'var(--brand-action)' : 'var(--surface)',
              color: year === y ? 'var(--ink)' : 'var(--text)',
              fontWeight: year === y ? 600 : 400,
            }}
          >
            {y}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : reviews.length === 0 ? (
        <div className="card">
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {year}-ci il üçün performans qiymətləndirməsi yoxdur.
            {isAdmin ? ' "Qiymətləndirmə" düyməsinə basın.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((rev) => (
            <div key={rev.id} className="card flex flex-col lg:flex-row gap-6">
              <Gauge score={rev.score} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-3">
                  {isAdmin && rev.profiles ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={rev.profiles.full_name ?? 'İşçi'} size={28} />
                      <span className="text-body font-medium">{rev.profiles.full_name ?? 'İşçi'}</span>
                      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>· {year}</span>
                    </div>
                  ) : <div />}
                  {/* PRD §8.3 — admin edit/delete actions */}
                  {isAdmin ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="chip"
                        style={{ color: 'var(--brand-text)' }}
                        onClick={() => printReview(rev)}
                        title="Çap et / PDF olaraq saxla"
                      >
                        🖨 Çap
                      </button>
                      <button
                        type="button"
                        className="chip"
                        style={{ color: 'var(--brand-text)' }}
                        onClick={() => setEditingReview(rev)}
                      >
                        Redaktə
                      </button>
                      {confirmDeleteId === rev.id ? (
                        <>
                          <button
                            type="button"
                            className="chip"
                            style={{ background: 'var(--error-deep)', color: 'white' }}
                            disabled={deleteReview.isPending}
                            onClick={() => deleteReview.mutate(rev.id)}
                          >
                            {deleteReview.isPending ? 'Silinir…' : 'Bəli, sil'}
                          </button>
                          <button
                            type="button"
                            className="chip"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Ləğv
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="chip"
                          style={{ color: 'var(--error-deep)' }}
                          onClick={() => setConfirmDeleteId(rev.id)}
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {RATING_KEYS.map((rk) => {
                    const val = (rev.ratings as Record<string, number>)?.[rk.key] ?? 0;
                    return (
                      <div key={rk.key}>
                        <div className="text-meta mb-1" style={{ color: 'var(--text-muted)' }}>
                          {rk.label}
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              style={{
                                width: 12, height: 12, borderRadius: '50%',
                                display: 'inline-block',
                                background: s <= val ? 'var(--brand-action)' : 'var(--line)',
                              }}
                            />
                          ))}
                          <span className="text-meta ml-1" style={{ color: 'var(--text-muted)' }}>
                            {val}/5
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {rev.summary ? (
                  <p className="text-body" style={{ color: 'var(--text-soft)' }}>{rev.summary}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && isAdmin ? (
        <AddReviewModal
          profiles={allProfiles}
          year={year}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['performance_reviews'] });
            setShowAddModal(false);
          }}
        />
      ) : null}

      {editingReview && isAdmin ? (
        <EditReviewModal
          review={editingReview}
          onClose={() => setEditingReview(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['performance_reviews'] });
            setEditingReview(null);
          }}
        />
      ) : null}
    </>
  );
}

// PRD §8.3 — admin edit modal for existing performance_reviews rows
function EditReviewModal({
  review,
  onClose,
  onSaved,
}: {
  review: Review;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(review.score);
  const [ratings, setRatings] = useState<Record<string, number>>({
    quality: review.ratings?.quality ?? 3,
    speed: review.ratings?.speed ?? 3,
    teamwork: review.ratings?.teamwork ?? 3,
    initiative: review.ratings?.initiative ?? 3,
  });
  const [summary, setSummary] = useState(review.summary ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('performance_reviews')
        .update({
          score,
          ratings,
          summary: summary.trim() || null,
        })
        .eq('id', review.id);
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-1">Qiymətləndirməni redaktə et</h2>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          {review.profiles?.full_name ?? 'İşçi'} · {review.year}
        </p>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ümumi bal (0–100)</span>
          <input
            type="number" className="input" min={0} max={100}
            value={score}
            onChange={(e) => setScore(Math.max(0, Math.min(100, Number(e.target.value))))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {RATING_KEYS.map((rk) => (
            <label key={rk.key} className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                {rk.label} (1–5)
              </span>
              <input
                type="number" className="input" min={1} max={5}
                value={ratings[rk.key]}
                onChange={(e) =>
                  setRatings((r) => ({
                    ...r,
                    [rk.key]: Math.max(1, Math.min(5, Number(e.target.value))),
                  }))
                }
              />
            </label>
          ))}
        </div>

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Xülasə</span>
          <textarea
            className="input" rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>

        {save.error ? (
          <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button
            className="btn-primary"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saxlanılır…' : 'Yenilə'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddReviewModal({
  profiles,
  year,
  onClose,
  onSaved,
}: {
  profiles: { id: string; full_name: string | null }[];
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [employeeId, setEmployeeId] = useState(profiles[0]?.id ?? '');
  const [score, setScore] = useState(70);
  const [ratings, setRatings] = useState<Record<string, number>>({
    quality: 3, speed: 3, teamwork: 3, initiative: 3,
  });
  const [summary, setSummary] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('performance_reviews').insert({
        employee_id: employeeId,
        year,
        score,
        ratings,
        reviewer_id: profile?.id,
        summary: summary.trim() || null,
      });
      if (error) throw error;
      await supabase.from('notifications').insert({
        user_id: employeeId,
        kind: 'performance_review',
        payload: { year, score },
        dispatched_channels: {},
      });
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">Performans qiymətləndirməsi · {year}</h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İşçi</span>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
            ))}
          </select>
        </label>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ümumi bal (0–100)</span>
          <input
            type="number" className="input" min={0} max={100}
            value={score}
            onChange={(e) => setScore(Math.max(0, Math.min(100, Number(e.target.value))))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {RATING_KEYS.map((rk) => (
            <label key={rk.key} className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                {rk.label} (1–5)
              </span>
              <input
                type="number" className="input" min={1} max={5}
                value={ratings[rk.key]}
                onChange={(e) =>
                  setRatings((r) => ({
                    ...r,
                    [rk.key]: Math.max(1, Math.min(5, Number(e.target.value))),
                  }))
                }
              />
            </label>
          ))}
        </div>

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Xülasə</span>
          <textarea
            className="input" rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>

        {save.error ? (
          <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button
            className="btn-primary"
            disabled={save.isPending || !employeeId}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
