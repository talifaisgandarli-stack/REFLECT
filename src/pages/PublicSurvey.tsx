/**
 * Public retrospective survey form — REQ-CRM-07.
 *
 * Reached via /sorğu/:token, no auth required. Submits to /api/survey/respond.
 * NPS 0–10 + per-category 1–5 stars + optional free text comment.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const RATING_CATEGORIES: { key: string; label: string }[] = [
  { key: 'communication', label: 'Ünsiyyət' },
  { key: 'quality', label: 'Keyfiyyət' },
  { key: 'timeliness', label: 'Vaxtında təhvil' },
  { key: 'value', label: 'Dəyər' },
];

type Status = 'loading' | 'ready' | 'already' | 'submitted' | 'notfound' | 'error';

export function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [projectName, setProjectName] = useState<string | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('notfound');
      return;
    }
    fetch(`/api/survey/respond?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 404) {
          setStatus('notfound');
          return;
        }
        const j = await r.json();
        setProjectName(j.project_name ?? null);
        setStatus(j.responded ? 'already' : 'ready');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nps == null) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/survey/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, nps_score: nps, ratings, comment }),
      });
      if (!r.ok) {
        setStatus('error');
        return;
      }
      setStatus('submitted');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <Centered>Yüklənir…</Centered>;
  }
  if (status === 'notfound') {
    return <Centered>Sorğu tapılmadı və ya keçərsizdir.</Centered>;
  }
  if (status === 'already') {
    return (
      <Centered>
        Cavab artıq qəbul edilib. Təşəkkür edirik!
      </Centered>
    );
  }
  if (status === 'submitted') {
    return <Centered>Təşəkkür edirik — geri-bildirim uğurla göndərildi.</Centered>;
  }
  if (status === 'error') {
    return <Centered>Xəta baş verdi. Yenidən cəhd edin.</Centered>;
  }

  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--bg)' }}>
      <form className="w-full max-w-xl p-6 space-y-6" onSubmit={submit}>
        <header>
          <h1 className="text-h1">Retrospektiv sorğu</h1>
          {projectName ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Layihə: {projectName}
            </p>
          ) : null}
        </header>

        <fieldset className="card space-y-3">
          <legend className="text-h3">
            Bizi başqasına tövsiyə etmək ehtimalı (NPS) — 0…10
          </legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 11 }).map((_, n) => (
              <button
                key={n}
                type="button"
                className={`chip ${nps === n ? 'chip-brand' : ''}`}
                onClick={() => setNps(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="card space-y-3">
          <legend className="text-h3">Kateqoriya üzrə qiymətləndirmə (1…5)</legend>
          {RATING_CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <span>{c.label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`chip ${ratings[c.key] === n ? 'chip-brand' : ''}`}
                    onClick={() => setRatings({ ...ratings, [c.key]: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="card">
          <legend className="text-h3 mb-2">Şərh (opsional)</legend>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="w-full text-body"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: 10,
            }}
          />
        </fieldset>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={nps == null || submitting}>
            {submitting ? '…' : 'Göndər'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 text-body text-center"
      style={{ background: 'var(--bg)' }}
    >
      {children}
    </div>
  );
}
