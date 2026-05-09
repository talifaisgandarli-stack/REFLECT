/**
 * Public retrospective survey page (REQ-CRM-07).
 * No auth required — the share_token is the access secret.
 * Calls retrospective_get/submit RPCs that bypass RLS via SECURITY DEFINER.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const RATING_DIMENSIONS = [
  { key: 'communication', label: 'Ünsiyyət' },
  { key: 'design_quality', label: 'Dizayn keyfiyyəti' },
  { key: 'timeliness', label: 'Vaxtlılıq' },
  { key: 'value', label: 'Dəyər (qiymət/keyfiyyət)' },
] as const;

type SurveyRow = {
  id: string;
  project_id: string;
  client_id: string | null;
  share_token: string;
  sent_at: string | null;
  responded_at: string | null;
  nps_score: number | null;
  ratings: Record<string, number>;
  comment: string | null;
};

export function SurveyPublicPage() {
  const { token = '' } = useParams();
  const [survey, setSurvey] = useState<SurveyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nps, setNps] = useState<number>(8);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc('retrospective_get', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const row = (data as SurveyRow[] | null)?.[0] ?? null;
      if (!row) {
        setError('Sorğu tapılmadı.');
      } else {
        setSurvey(row);
        if (row.responded_at) setSubmitted(true);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (!survey) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc('retrospective_submit', {
      p_token: token,
      p_nps: nps,
      p_ratings: ratings,
      p_comment: comment || null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-lg" style={{ padding: 32 }}>
        <h1 className="text-h1">Reflect — sorğu</h1>
        <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
          Cavablarınız yalnız studiya tərəfindən görünür.
        </p>

        {loading ? (
          <p className="text-body mt-6">Yüklənir…</p>
        ) : error ? (
          <p className="text-body mt-6" style={{ color: 'var(--state-error)' }}>
            {error}
          </p>
        ) : submitted ? (
          <div className="mt-6">
            <h2 className="text-h2">Təşəkkürlər! ✓</h2>
            <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
              Cavabınız qeydə alındı. Bunu bağlaya bilərsiniz.
            </p>
          </div>
        ) : survey ? (
          <div className="mt-6 space-y-5">
            <div>
              <label className="block">
                <span className="text-h4 block">NPS — bizi tövsiyə edərsinizmi?</span>
                <span
                  className="text-meta block mt-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  0 (heç vaxt) – 10 (mütləq)
                </span>
              </label>
              <div className="flex flex-wrap gap-2 mt-3">
                {Array.from({ length: 11 }, (_, i) => i).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="chip"
                    onClick={() => setNps(v)}
                    style={{
                      width: 36,
                      height: 36,
                      justifyContent: 'center',
                      background: nps === v ? 'var(--brand-action)' : 'var(--surface-mist)',
                      color: nps === v ? 'var(--ink)' : 'var(--text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-h4 mb-2">Aspektlər (1-5 ulduz)</h3>
              <div className="space-y-3">
                {RATING_DIMENSIONS.map((d) => (
                  <div key={d.key} className="flex items-center justify-between gap-3">
                    <span className="text-body">{d.label}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-label={`${d.label} ${s} ulduz`}
                          onClick={() =>
                            setRatings((prev) => ({ ...prev, [d.key]: s }))
                          }
                          style={{
                            width: 28,
                            height: 28,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color:
                              (ratings[d.key] ?? 0) >= s
                                ? 'var(--brand-action)'
                                : 'var(--line)',
                            fontSize: 22,
                            lineHeight: '28px',
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-h4 block mb-2">Şərh (könüllü)</span>
              <textarea
                className="input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ minHeight: 120, padding: '12px 14px' }}
                placeholder="Bizə daha yaxşı olmaq üçün nə tövsiyə edərdiniz?"
              />
            </label>

            <button
              type="button"
              className="btn-primary w-full"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Göndərilir…' : 'Cavabı göndər'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
