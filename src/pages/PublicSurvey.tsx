/**
 * REQ-CRM-07 — Public retrospective survey form.
 * Renders at /survey/:token. NPS 0–10 + per-category 1–5 stars + comment.
 * Categories from PRD §6 closeout: kommunikasiya, keyfiyyət, vaxt, dəyər.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const CATEGORIES = [
  { key: 'communication', label: 'Kommunikasiya' },
  { key: 'quality', label: 'Keyfiyyət' },
  { key: 'timeliness', label: 'Vaxtında çatdırılma' },
  { key: 'value', label: 'Dəyər / qiymət' },
] as const;

export function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<{ project_name: string | null; responded: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/surveys/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Tapılmadı'))))
      .then((d) => setProject(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (nps === null) {
      setError('NPS göstəricisini seçin');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/surveys/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nps_score: nps, ratings, comment }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Xəta');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-meta">Yüklənir…</div>;
  }
  if (error && !project) {
    return <div className="p-10 text-center" style={{ color: 'var(--danger, #c33)' }}>{error}</div>;
  }
  if (project?.responded || done) {
    return (
      <div className="max-w-xl mx-auto p-10">
        <h1 className="text-h1">Təşəkkürlər!</h1>
        <p className="text-body mt-3">Rəyiniz qeydə alındı.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto p-6 md:p-10">
      <h1 className="text-h1">Retrospektiv sorğu</h1>
      {project?.project_name ? (
        <p className="text-body mt-2" style={{ color: 'var(--text-muted)' }}>
          Layihə: <strong>{project.project_name}</strong>
        </p>
      ) : null}

      <section className="card mt-6">
        <h2 className="text-h3">Bizi neçə bal verərsiniz? (0–10)</h2>
        <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
          NPS: 0 = heç vaxt tövsiyə etməzdim, 10 = mütləq tövsiyə edərəm.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`chip ${nps === i ? 'chip-brand' : ''}`}
              onClick={() => setNps(i)}
            >
              {i}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="text-h3">Hər kateqoriyanı qiymətləndirin (1–5)</h2>
        <ul className="mt-3 space-y-3">
          {CATEGORIES.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-4">
              <span className="text-body">{c.label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="chip"
                    style={{
                      color: ratings[c.key] >= n ? 'var(--brand-text)' : 'var(--text-muted)',
                      borderColor: ratings[c.key] >= n ? 'var(--brand-action)' : 'var(--line)',
                    }}
                    onClick={() => setRatings((p) => ({ ...p, [c.key]: n }))}
                  >
                    ★
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-4">
        <label className="text-body block">
          Şərh (istəyə bağlı)
          <textarea
            className="input mt-2 w-full"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Nə yaxşı işlədi, nə yaxşılaşdırıla bilər?"
          />
        </label>
      </section>

      {error ? (
        <div className="text-meta mt-3" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="mt-4">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Göndərilir…' : 'Göndər'}
        </button>
      </div>
    </form>
  );
}
