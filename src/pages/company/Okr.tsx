/**
 * OKR — PRD §9.1.
 *   Company OKR (admin only); Personal OKR (user sees own; admin sees all).
 *   Health: On Track ≥70%, At Risk 40–69%, Off Track <40%.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useState } from 'react';
import { useAuth } from '@/lib/store';

type Okr = {
  id: string;
  scope: 'company' | 'personal';
  employee_id: string | null;
  period: string;
  objective: string;
};

type KeyResult = {
  id: string;
  okr_id: string;
  title: string;
  current_value: number;
  target_value: number;
  unit: string | null;
};

function health(progress: number): { label: string; color: string } {
  if (progress >= 0.7) return { label: 'On Track', color: '#15803D' };
  if (progress >= 0.4) return { label: 'At Risk', color: '#D97706' };
  return { label: 'Off Track', color: '#B91C1C' };
}

export function OkrPage() {
  const { isAdmin } = useAuth();
  const [scope, setScope] = useState<'company' | 'personal'>('company');
  const [open, setOpen] = useState(false);

  const okrs = useQuery({
    queryKey: ['okrs', scope],
    queryFn: async () =>
      ((await supabase.from('okrs').select('*').eq('scope', scope)).data ?? []) as Okr[],
  });

  const krs = useQuery({
    queryKey: ['krs', scope, (okrs.data ?? []).map((o) => o.id).join(',')],
    enabled: (okrs.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (okrs.data ?? []).map((o) => o.id);
      const { data } = await supabase.from('key_results').select('*').in('okr_id', ids);
      return (data ?? []) as KeyResult[];
    },
  });

  const krsByOkr = new Map<string, KeyResult[]>();
  for (const k of krs.data ?? []) {
    const arr = krsByOkr.get(k.okr_id) ?? [];
    arr.push(k);
    krsByOkr.set(k.okr_id, arr);
  }

  const canCreate = scope === 'personal' || isAdmin;

  return (
    <>
      <PageHead
        meta="Q əsasında"
        title="OKR"
        actions={
          <>
            {(['company', 'personal'] as const).map((s) => (
              <button
                key={s}
                className={`chip ${scope === s ? 'chip-brand' : ''}`}
                onClick={() => setScope(s)}
              >
                {s === 'company' ? 'Şirkət' : 'Şəxsi'}
              </button>
            ))}
            {canCreate ? (
              <button className="btn-primary" onClick={() => setOpen(true)}>
                + Obyektiv
              </button>
            ) : null}
          </>
        }
      />
      {(okrs.data ?? []).length === 0 ? (
        <EmptyState title="OKR yoxdur" body="İlk məqsədi yaradın — Key Results-larla bağlayın." />
      ) : (
        <ul className="space-y-3">
          {(okrs.data ?? []).map((o) => {
            const list = krsByOkr.get(o.id) ?? [];
            const progress =
              list.length > 0
                ? list.reduce(
                    (s, k) =>
                      s + Math.min(1, k.target_value > 0 ? k.current_value / k.target_value : 0),
                    0,
                  ) / list.length
                : 0;
            const h = health(progress);
            return (
              <li key={o.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-h3">{o.objective}</h3>
                    <div
                      className="text-meta"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {o.period}
                    </div>
                  </div>
                  <span style={{ color: h.color, fontWeight: 600 }}>
                    {h.label} · {Math.round(progress * 100)}%
                  </span>
                </div>
                {list.length > 0 ? (
                  <ul className="mt-3 space-y-1">
                    {list.map((k) => (
                      <li
                        key={k.id}
                        className="text-meta"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        · {k.title} — {k.current_value}/{k.target_value} {k.unit ?? ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {open ? <OkrAddModal scope={scope} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function OkrAddModal({
  scope,
  onClose,
}: {
  scope: 'company' | 'personal';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [objective, setObjective] = useState('');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `${d.getFullYear()} Q${q}`;
  });

  const submit = useMutation({
    mutationFn: async () => {
      const payload: {
        scope: 'company' | 'personal';
        objective: string;
        period: string;
        employee_id?: string;
        owner_id?: string;
      } = { scope, objective, period };
      if (scope === 'personal' && session?.userId) {
        payload.employee_id = session.userId;
      }
      const { error } = await supabase.from('okrs').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['okrs', scope] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-md w-full space-y-3">
        <h3 className="text-h3">{scope === 'company' ? 'Şirkət OKR' : 'Şəxsi OKR'}</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Obyektiv
          </span>
          <textarea
            className="input mt-1 w-full"
            rows={3}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Dövr
          </span>
          <input
            className="input mt-1 w-full"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026 Q1"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!objective || !period || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
