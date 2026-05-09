/**
 * REQ-CRM-07: Public retrospective survey — no auth required.
 * Route: /sorğu/:token
 * NPS 0-10, per-category ratings 1-5, free text comment.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';

const CATEGORIES = [
  { key: 'communication', label: 'Ünsiyyət' },
  { key: 'quality', label: 'Keyfiyyət' },
  { key: 'timeline', label: 'Müddətlərə riayət' },
  { key: 'value', label: 'Qiymət/Keyfiyyət nisbəti' },
];

type Phase = 'form' | 'success' | 'already_done' | 'not_found';

export function SurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [nps, setNps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (nps === null) { setErr('NPS balını seçin'); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/surveys/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ share_token: token, nps_score: nps, ratings, comment: comment.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409) { setPhase('already_done'); return; }
      if (res.status === 404) { setPhase('not_found'); return; }
      if (!res.ok) throw new Error(data?.error ?? `Xəta (${res.status})`);
      setPhase('success');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="card max-w-md w-full text-center p-8">
          <div className="text-h1 mb-3">✓</div>
          <h1 className="text-h2 mb-2">Təşəkkür edirik!</h1>
          <p className="text-body" style={{ color: 'var(--text-muted)' }}>Cavabınız qeyd edildi.</p>
        </div>
      </div>
    );
  }

  if (phase === 'already_done') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="card max-w-md w-full text-center p-8">
          <h1 className="text-h2 mb-2">Bu sorğu artıq cavablanıb</h1>
          <p className="text-body" style={{ color: 'var(--text-muted)' }}>Hər sorğuya bir dəfə cavab vermək mümkündür.</p>
        </div>
      </div>
    );
  }

  if (phase === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="card max-w-md w-full text-center p-8">
          <h1 className="text-h2 mb-2">Sorğu tapılmadı</h1>
          <p className="text-body" style={{ color: 'var(--text-muted)' }}>Link etibarsızdır.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: 'var(--bg)' }}>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center mb-6">
          <h1 className="text-h1">Müştəri sorğusu</h1>
          <p className="text-body mt-2" style={{ color: 'var(--text-muted)' }}>
            Əməkdaşlığımızı qiymətləndirin — cavabınız bizim inkişafımıza kömək edir.
          </p>
        </div>

        {/* NPS 0-10 */}
        <section className="card">
          <h2 className="text-h3 mb-1">Ümumi tövsiyə balı</h2>
          <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
            0 — Heç tövsiyə etmərəm · 10 — Mütləq tövsiyə edərəm
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => setNps(i)}
                className={`chip ${nps === i ? 'chip-brand' : ''}`}
                style={{ minWidth: 40, justifyContent: 'center' }}
              >
                {i}
              </button>
            ))}
          </div>
        </section>

        {/* Per-category ratings 1-5 */}
        <section className="card">
          <h2 className="text-h3 mb-4">Kateqoriya üzrə qiymət</h2>
          <div className="space-y-4">
            {CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <div className="text-body mb-2">{cat.label}</div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() => setRatings((r) => ({ ...r, [cat.key]: v }))}
                      className={`chip ${ratings[cat.key] === v ? 'chip-brand' : ''}`}
                      style={{ minWidth: 36, justifyContent: 'center' }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Free text comment */}
        <section className="card">
          <h2 className="text-h3 mb-3">Əlavə qeyd (opsional)</h2>
          <textarea
            className="input w-full"
            rows={4}
            placeholder="Şərhinizi yazın…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
          />
        </section>

        {err ? <p className="text-meta" style={{ color: '#EF4444' }}>{err}</p> : null}

        <button
          className="btn-primary w-full"
          disabled={submitting || nps === null}
          onClick={submit}
        >
          {submitting ? 'Göndərilir…' : 'Göndər'}
        </button>
      </div>
    </div>
  );
}
