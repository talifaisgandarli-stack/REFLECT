import { useMemo } from 'react';
import { useKeyResultsForOkrs, useOkrs } from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import type { KeyResult } from '@/types/db';

/**
 * REQ-DASH-02: user dashboard shows personal OKR progress.
 * RLS scopes okrs SELECT to scope='company' OR employee_id=auth.uid(),
 * so filtering here by employee_id is safe even though we re-filter client-side.
 */
export function PersonalOkrWidget({ className }: { className?: string }) {
  const { profile } = useAuth();
  const { data: okrs = [] } = useOkrs(
    profile?.id ? { scope: 'personal', employeeId: profile.id } : undefined,
  );
  const { data: krs = [] } = useKeyResultsForOkrs(okrs.map((o) => o.id));

  const top = okrs.slice(0, 3);
  const krByOkr = useMemo(() => groupByOkr(krs), [krs]);

  return (
    <section className={`card ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">Mənim OKR-larım</h3>
        <a href="/şirkət/okr" className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hamısı →
        </a>
      </div>
      {top.length === 0 ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Şəxsi obyektiv yoxdur.
        </div>
      ) : (
        <ul className="space-y-3">
          {top.map((o) => {
            const k = krByOkr.get(o.id) ?? [];
            const pct = progress(k);
            const tone = healthColor(pct);
            return (
              <li key={o.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body truncate">{o.objective}</span>
                  <span
                    className="text-meta shrink-0"
                    style={{ fontVariantNumeric: 'tabular-nums', color: tone }}
                  >
                    {pct}%
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--line-soft)' }}
                >
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, background: tone, transition: 'width 200ms' }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function groupByOkr(krs: KeyResult[]) {
  const m = new Map<string, KeyResult[]>();
  for (const k of krs) {
    const arr = m.get(k.okr_id) ?? [];
    arr.push(k);
    m.set(k.okr_id, arr);
  }
  return m;
}

function progress(krs: KeyResult[]): number {
  if (krs.length === 0) return 0;
  const total = krs.reduce((s, k) => {
    if (!(k.target_value > 0)) return s;
    return s + Math.min(1, Number(k.current_value) / Number(k.target_value));
  }, 0);
  return Math.round((total / krs.length) * 100);
}

function healthColor(pct: number): string {
  if (pct >= 70) return 'var(--brand-text)';
  if (pct >= 40) return '#D97706';
  return '#B91C1C';
}
