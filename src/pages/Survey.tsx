/**
 * Public retrospective-survey form — REQ-CRM-07.
 * Route: /survey/:token  (no auth, outside Layout)
 *
 * Categories per PRD US-CRM-07: communication, quality, timeliness, value.
 * (Wording locked to PRD AZ vocab where applicable.)
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Mascot } from '@/components/Mascot';
import { fetchSurveyByToken, submitSurvey } from '@/lib/crm';

const CATEGORIES = [
  { key: 'communication', label: 'Ünsiyyət' },
  { key: 'quality', label: 'Keyfiyyət' },
  { key: 'timeliness', label: 'Vaxtlılıq' },
  { key: 'value', label: 'Dəyər' },
] as const;

export function SurveyPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);

  const [nps, setNps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSurveyByToken(token);
        if (cancelled) return;
        if (!s) {
          setErr('Sorğu tapılmadı.');
          setState('error');
        } else if (s.responded_at) {
          setState('done');
        } else {
          setState('ready');
        }
      } catch (e) {
        if (cancelled) return;
        setErr((e as Error).message);
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit() {
    if (nps == null) {
      setErr('NPS bal seç.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await submitSurvey(token, {
        nps_score: nps,
        ratings,
        comment: comment.trim() || null,
      });
      setState('done');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--canvas)' }}>
      <div className="card w-full max-w-[640px]" style={{ padding: 32 }}>
        <div className="flex items-center gap-3 mb-6">
          <Mascot size={48} decorative />
          <span className="text-h2 font-bold" style={{ color: 'var(--brand-text)' }}>Reflect</span>
        </div>

        {state === 'loading' ? (
          <p className="text-body">Yüklənir…</p>
        ) : state === 'error' ? (
          <p className="text-body" style={{ color: '#B91C1C' }}>{err ?? 'Xəta baş verdi.'}</p>
        ) : state === 'done' ? (
          <div>
            <h1 className="text-h1 mb-2">Təşəkkürlər!</h1>
            <p className="text-body" style={{ color: 'var(--text-soft)' }}>
              Cavabınız qeydə alındı. Komandamız geri-bildirimi nəzərdən keçirəcək.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-h1 mb-2">Layihə retrospektivi</h1>
            <p className="text-body mb-6" style={{ color: 'var(--text-soft)' }}>
              Bizimlə işləmə təcrübənizi qiymətləndirməyiniz üçün təxminən 1 dəqiqə.
            </p>

            <section className="mb-6">
              <h3 className="text-h3 mb-2">Bizi tövsiyə edərdinizmi? (0–10)</h3>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chip ${nps === i ? 'chip-brand' : ''}`}
                    onClick={() => setNps(i)}
                    style={{ minWidth: 44 }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-6 space-y-3">
              <h3 className="text-h3">Aşağıdakıları qiymətləndir (1–5)</h3>
              {CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center justify-between">
                  <span className="text-body">{c.label}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`chip ${ratings[c.key] === v ? 'chip-brand' : ''}`}
                        onClick={() => setRatings((cur) => ({ ...cur, [c.key]: v }))}
                        aria-label={`${c.label}: ${v}`}
                        style={{ minWidth: 36 }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="mb-6">
              <label className="block">
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  Sərbəst rəy (istəyə bağlı)
                </span>
                <textarea
                  className="input mt-1"
                  style={{ height: 100, padding: 12 }}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
            </section>

            {err ? <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>{err}</p> : null}

            <button
              type="button"
              className="btn-primary w-full"
              onClick={onSubmit}
              disabled={busy || nps == null}
            >
              {busy ? 'Göndərilir…' : 'Cavabı göndər'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
