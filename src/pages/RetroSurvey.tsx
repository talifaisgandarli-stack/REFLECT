/**
 * REQ-CRM-07 — US-CRM-06 — Public retrospective survey form (no auth required).
 * Accessed via share_token from retrospective_surveys table.
 * NPS 0–10 + per-category 1–5 stars + free comment.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const CATEGORIES = [
  { key: 'communication', label: 'Kommunikasiya' },
  { key: 'quality', label: 'İş keyfiyyəti' },
  { key: 'timing', label: 'Vaxt rəayəti' },
  { key: 'professionalism', label: 'Peşəkarlıq' },
];

type Survey = {
  id: string;
  project_id: string | null;
  responded_at: string | null;
};

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          style={{
            fontSize: 24,
            color: s <= value ? '#F59E0B' : 'var(--line)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
          }}
          aria-label={`${s} ulduz`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function RetroSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [nps, setNps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({
    communication: 0, quality: 0, timing: 0, professionalism: 0,
  });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    supabase
      .from('retrospective_surveys')
      .select('id, project_id, responded_at')
      .eq('share_token', token)
      .maybeSingle()
      .then(({ data }) => {
        setSurvey(data as Survey | null);
        setLoading(false);
        if (data?.responded_at) setSubmitted(true);
      });
  }, [token]);

  async function submit() {
    if (!survey || nps === null) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('retrospective_surveys')
      .update({
        nps_score: nps,
        ratings,
        comment: comment.trim() || null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', survey.id);
    if (err) {
      setError(err.message);
    } else {
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-meta">Yüklənir…</p>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-md text-center">
          <h1 className="text-h2 mb-2">Sorğu tapılmadı</h1>
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Bu link etibarlı deyil və ya müddəti bitib.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-md text-center">
          <div style={{ fontSize: 48 }}>✓</div>
          <h1 className="text-h2 mt-3 mb-2">Təşəkkür edirik!</h1>
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Cavabınız qeydə alındı. Əməkdaşlığınız üçün minnətdarıq.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{ background: 'var(--canvas)', color: 'var(--text)' }}
    >
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-h1">Müştəri Sorğusu</h1>
          <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
            Layihə ilə bağlı təcrübənizi bölüşün
          </p>
        </div>

        {/* NPS — 0–10 */}
        <div className="card">
          <h2 className="text-h3 mb-1">Tövsiyə ehtimalı</h2>
          <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
            Bizi tanışlarınıza nə dərəcədə tövsiyə edərdiniz? (0 = əsla, 10 = mütləq)
          </p>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNps(n)}
                className="chip"
                style={{
                  width: 40, height: 40, padding: 0,
                  background: nps === n ? 'var(--brand-action)' : 'var(--surface)',
                  color: nps === n ? 'var(--ink)' : 'var(--text)',
                  fontWeight: nps === n ? 700 : 400,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {nps !== null ? (
            <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
              {nps >= 9 ? 'Promoter — əla!' : nps >= 7 ? 'Passiv' : 'Detractor'}
            </p>
          ) : null}
        </div>

        {/* Per-category star ratings */}
        <div className="card space-y-4">
          <h2 className="text-h3">Kateqoriyalara görə qiymət</h2>
          {CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <div className="text-body mb-1">{cat.label}</div>
              <StarRating
                value={ratings[cat.key]}
                onChange={(v) => setRatings((r) => ({ ...r, [cat.key]: v }))}
              />
            </div>
          ))}
        </div>

        {/* Free comment */}
        <div className="card">
          <h2 className="text-h3 mb-2">Rəy (istəyə bağlı)</h2>
          <textarea
            className="input w-full"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Əlavə fikirlər, təkliflər…"
          />
        </div>

        {error ? (
          <p className="text-meta" style={{ color: '#B91C1C' }}>{error}</p>
        ) : null}

        <button
          type="button"
          className="btn-primary w-full"
          disabled={nps === null || submitting}
          onClick={submit}
          style={{ height: 48 }}
        >
          {submitting ? 'Göndərilir…' : 'Sorğunu göndər'}
        </button>
      </div>
    </div>
  );
}
