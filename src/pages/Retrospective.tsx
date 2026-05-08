/**
 * Public retrospective survey form — REQ-CRM-07 / US-CRM-06.
 * No auth required. Opened via /r/:token from a share link.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const RATING_CATEGORIES: { key: string; label: string }[] = [
  { key: 'communication', label: 'Ünsiyyət' },
  { key: 'quality', label: 'Keyfiyyət' },
  { key: 'timeliness', label: 'Vaxtında təhvil' },
  { key: 'value', label: 'Dəyər/Qiymət' },
];

type Phase = 'loading' | 'open' | 'already' | 'submitted' | 'not_found';

export function RetrospectivePage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [projectName, setProjectName] = useState<string>('');
  const [nps, setNps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc('get_retrospective_by_token', {
        p_token: token,
      });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setPhase('not_found');
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setProjectName(row.project_name);
      setPhase(row.responded ? 'already' : 'open');
    })();
  }, [token]);

  const valid = useMemo(
    () => nps !== null && Object.keys(ratings).length === RATING_CATEGORIES.length,
    [nps, ratings],
  );

  async function submit() {
    if (!token || nps === null) return;
    setErr(null);
    setSubmitting(true);
    const { error } = await supabase.rpc('submit_retrospective', {
      p_token: token,
      p_nps_score: nps,
      p_ratings: ratings,
      p_comment: comment || null,
    });
    setSubmitting(false);
    if (error) {
      if (error.message.includes('already_responded')) {
        setPhase('already');
      } else {
        setErr(error.message);
      }
      return;
    }
    setPhase('submitted');
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--canvas)' }}
    >
      <div className="w-full max-w-xl card">
        <h1 className="text-h2 mb-1">Müştəri rəyi</h1>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          {projectName ? `Layihə: ${projectName}` : ' '}
        </p>

        {phase === 'loading' ? <div className="text-meta">Yüklənir…</div> : null}
        {phase === 'not_found' ? (
          <div className="text-body" style={{ color: 'var(--danger, #B91C1C)' }}>
            Sorğu tapılmadı. Linki yenidən yoxlayın.
          </div>
        ) : null}
        {phase === 'already' ? (
          <div className="text-body">Təşəkkürlər — rəyiniz artıq qeyd olunub.</div>
        ) : null}
        {phase === 'submitted' ? (
          <div className="text-body">Təşəkkürlər! Rəyiniz qeyd olundu.</div>
        ) : null}

        {phase === 'open' ? (
          <>
            <section className="mb-5">
              <div
                className="text-tiny uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Bizi nə qədər tövsiyə edərdiniz? (0–10)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setNps(i)}
                    className="rounded-btn"
                    style={{
                      width: 40,
                      height: 40,
                      border: '1px solid var(--line)',
                      background: nps === i ? 'var(--brand-action)' : 'var(--surface)',
                      color: nps === i ? 'var(--ink)' : 'var(--text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-5">
              <div
                className="text-tiny uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Kateqoriyalar (1–5)
              </div>
              <ul className="space-y-3">
                {RATING_CATEGORIES.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3">
                    <span className="text-body">{c.label}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRatings((p) => ({ ...p, [c.key]: n }))}
                          aria-label={`${c.label}: ${n}`}
                          style={{
                            fontSize: 22,
                            color:
                              (ratings[c.key] ?? 0) >= n
                                ? '#D97706'
                                : 'var(--line)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mb-5">
              <label className="block">
                <div
                  className="text-tiny uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Şərh (opsional)
                </div>
                <textarea
                  className="input w-full"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
            </section>

            {err ? (
              <div
                className="text-meta mb-3"
                style={{ color: 'var(--danger, #B91C1C)' }}
              >
                {err}
              </div>
            ) : null}

            <button
              className="btn-primary w-full"
              disabled={!valid || submitting}
              onClick={submit}
            >
              {submitting ? 'Göndərilir…' : 'Göndər'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
