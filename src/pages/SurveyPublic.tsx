/**
 * Public retrospective survey page (REQ-CRM-07).
 * No auth required — the share_token is the access secret.
 * Calls retrospective_get/submit RPCs that bypass RLS via SECURITY DEFINER.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

const RATING_DIMENSIONS = [
  'communication',
  'design_quality',
  'timeliness',
  'value',
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
  const t = useT();
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
        setError(t('survey.not_found'));
      } else {
        setSurvey(row);
        if (row.responded_at) setSubmitted(true);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <h1 className="text-h1">{t('survey.title')}</h1>
        <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('survey.privacy')}
        </p>

        {loading ? (
          <p className="text-body mt-6">{t('common.loading')}</p>
        ) : error ? (
          <p className="text-body mt-6" style={{ color: 'var(--state-error)' }}>
            {error}
          </p>
        ) : submitted ? (
          <div className="mt-6">
            <h2 className="text-h2">{t('survey.thanks_title')}</h2>
            <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
              {t('survey.thanks_body')}
            </p>
          </div>
        ) : survey ? (
          <div className="mt-6 space-y-5">
            <div>
              <label className="block">
                <span className="text-h4 block">{t('survey.nps.title')}</span>
                <span
                  className="text-meta block mt-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t('survey.nps.scale')}
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
              <h3 className="text-h4 mb-2">{t('survey.aspects.title')}</h3>
              <div className="space-y-3">
                {RATING_DIMENSIONS.map((key) => {
                  const label = t(`survey.aspect.${key}`);
                  return (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-body">{label}</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-label={t('survey.star_aria', { aspect: label, n: s })}
                            onClick={() =>
                              setRatings((prev) => ({ ...prev, [key]: s }))
                            }
                            style={{
                              width: 28,
                              height: 28,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color:
                                (ratings[key] ?? 0) >= s
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
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-h4 block mb-2">{t('survey.comment.title')}</span>
              <textarea
                className="input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ minHeight: 120, padding: '12px 14px' }}
                placeholder={t('survey.comment.placeholder')}
              />
            </label>

            <button
              type="button"
              className="btn-primary w-full"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? t('survey.submitting') : t('survey.submit')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
