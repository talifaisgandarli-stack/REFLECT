/**
 * US-OKR-01 — admin creates company OKRs per quarter with key_results
 * US-OKR-02 — user updates personal OKR current_value
 * US-OKR-03 — admin health overview: On Track ≥70% / At Risk 40–69% / Off Track <40%
 * Schema: okrs(id, scope, employee_id, period, objective, owner_id)
 *         key_results(id, okr_id, title, metric_type, current_value, target_value, unit, updated_at)
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type KeyResult = {
  id: string;
  okr_id: string;
  title: string;
  metric_type: string | null;
  current_value: number;
  target_value: number;
  unit: string | null;
  updated_at: string;
};

type Okr = {
  id: string;
  scope: 'company' | 'personal';
  employee_id: string | null;
  period: string;
  objective: string;
  owner_id: string | null;
  created_at: string;
  key_results?: KeyResult[];
};

function progress(okr: Okr): number {
  const krs = okr.key_results ?? [];
  if (!krs.length) return 0;
  const avg = krs.reduce((s, kr) => s + (kr.target_value > 0 ? Math.min(1, kr.current_value / kr.target_value) : 0), 0) / krs.length;
  return Math.round(avg * 100);
}

function healthLabel(pct: number): { label: string; color: string } {
  if (pct >= 70) return { label: 'On Track', color: 'var(--success-deep)' };
  if (pct >= 40) return { label: 'At Risk', color: 'var(--warning)' };
  return { label: 'Off Track', color: 'var(--error-deep)' };
}

export function OkrPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<'company' | 'personal'>('company');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const okrs = useQuery({
    queryKey: ['okrs', scope],
    queryFn: async (): Promise<Okr[]> => {
      const { data, error } = await supabase
        .from('okrs')
        .select('*, key_results(*)')
        .eq('scope', scope)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Okr[];
    },
  });

  const updateKr = useMutation({
    mutationFn: async ({ id, current_value }: { id: string; current_value: number }) => {
      const { error } = await supabase
        .from('key_results')
        .update({ current_value, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs'] }),
  });

  return (
    <>
      <PageHead
        meta="Q əsasında"
        title="OKR"
        actions={
          <>
            {(['company', 'personal'] as const).map((s) => (
              <button key={s} className={`chip ${scope === s ? 'chip-brand' : ''}`} onClick={() => setScope(s)}>
                {s === 'company' ? 'Şirkət' : 'Şəxsi'}
              </button>
            ))}
            {(isAdmin || scope === 'personal') ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>+ Obyektiv</button>
            ) : null}
          </>
        }
      />

      {/* US-OKR-03 — admin health overview (company scope) */}
      {isAdmin && scope === 'company' && (okrs.data ?? []).length > 0 ? (
        <div className="flex gap-4 mb-4 flex-wrap">
          {(['On Track', 'At Risk', 'Off Track'] as const).map((label) => {
            const count = (okrs.data ?? []).filter((o) => healthLabel(progress(o)).label === label).length;
            const color = label === 'On Track' ? 'var(--success-deep)' : label === 'At Risk' ? 'var(--warning)' : 'var(--error-deep)';
            return (
              <div key={label} className="card flex items-center gap-3 px-4 py-2" style={{ minWidth: 140 }}>
                <span className="text-h2" style={{ color }}>{count}</span>
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {(okrs.data ?? []).length === 0 ? (
        <EmptyState title="OKR yoxdur" body="İlk məqsədi yarat — Key Results-larla izlə." />
      ) : (
        <div className="space-y-3">
          {(okrs.data ?? []).map((o) => {
            const pct = progress(o);
            const health = healthLabel(pct);
            const isOpen = expanded === o.id;
            const canEdit = isAdmin || o.employee_id === profile?.id;

            return (
              <div key={o.id} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : o.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="chip text-meta" style={{ padding: '2px 6px', fontSize: 11 }}>{o.period}</span>
                      <span className="text-meta" style={{ color: health.color, fontSize: 11, fontWeight: 600 }}>
                        {health.label}
                      </span>
                    </div>
                    <h3 className="text-h3">{o.objective}</h3>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div style={{ textAlign: 'right' }}>
                      <div className="text-h3" style={{ color: health.color }}>{pct}%</div>
                      <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {(o.key_results ?? []).length} KR
                      </div>
                    </div>
                    <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1 rounded-full" style={{ background: 'var(--line)' }}>
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{ width: `${pct}%`, background: health.color }}
                  />
                </div>

                {/* Expanded key results */}
                {isOpen ? (
                  <div className="mt-4 space-y-3">
                    {(o.key_results ?? []).map((kr) => {
                      const krPct = kr.target_value > 0 ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100)) : 0;
                      return (
                        <div key={kr.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-body">{kr.title}</span>
                            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                              {kr.current_value} / {kr.target_value} {kr.unit ?? ''} ({krPct}%)
                            </span>
                          </div>
                          <div className="h-1 rounded-full mb-1" style={{ background: 'var(--line)' }}>
                            <div className="h-1 rounded-full" style={{ width: `${krPct}%`, background: 'var(--brand-action)' }} />
                          </div>
                          {canEdit ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="number"
                                className="input max-w-[100px]"
                                style={{ height: 30, fontSize: 13 }}
                                defaultValue={kr.current_value}
                                onBlur={(e) => {
                                  const val = Number(e.target.value);
                                  if (!isNaN(val) && val !== kr.current_value) {
                                    updateKr.mutate({ id: kr.id, current_value: val });
                                  }
                                }}
                              />
                              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                                / {kr.target_value} {kr.unit ?? ''}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {creating ? (
        <CreateOkrModal
          scope={scope}
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['okrs'] });
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}

function CreateOkrModal({
  scope,
  onClose,
  onSaved,
}: {
  scope: 'company' | 'personal';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [period, setPeriod] = useState('Q2 2026');
  const [objective, setObjective] = useState('');
  const [krs, setKrs] = useState([
    { title: '', target_value: '', unit: '' },
    { title: '', target_value: '', unit: '' },
    { title: '', target_value: '', unit: '' },
  ]);

  const save = useMutation({
    mutationFn: async () => {
      if (!objective.trim()) throw new Error('Obyektiv daxil edin');
      if (!period.trim()) throw new Error('Dövr daxil edin');

      const { data, error } = await supabase.from('okrs').insert({
        scope,
        employee_id: scope === 'personal' ? profile?.id : null,
        period: period.trim(),
        objective: objective.trim(),
        owner_id: profile?.id,
      }).select('id').single();
      if (error) throw error;

      const validKrs = krs.filter((kr) => kr.title.trim() && Number(kr.target_value) > 0);
      if (validKrs.length) {
        const { error: krErr } = await supabase.from('key_results').insert(
          validKrs.map((kr) => ({
            okr_id: data.id,
            title: kr.title.trim(),
            target_value: Number(kr.target_value),
            current_value: 0,
            unit: kr.unit.trim() || null,
          })),
        );
        if (krErr) throw krErr;
      }
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div className="bg-surface p-6 rounded-card w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-h2 mb-4">{scope === 'company' ? 'Şirkət OKR' : 'Şəxsi OKR'}</h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Dövr</span>
          <input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Q2 2026" />
        </label>

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Obyektiv</span>
          <input className="input" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Müştəri məmnunluğunu artır…" />
        </label>

        <h3 className="text-h3 mb-3">Key Results</h3>
        <div className="space-y-3">
          {krs.map((kr, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={`KR ${i + 1} başlığı…`}
                value={kr.title}
                onChange={(e) => setKrs((prev) => prev.map((k, j) => j === i ? { ...k, title: e.target.value } : k))}
              />
              <input
                type="number"
                className="input max-w-[80px]"
                placeholder="Hədəf"
                value={kr.target_value}
                onChange={(e) => setKrs((prev) => prev.map((k, j) => j === i ? { ...k, target_value: e.target.value } : k))}
              />
              <input
                className="input max-w-[70px]"
                placeholder="Vahid"
                value={kr.unit}
                onChange={(e) => setKrs((prev) => prev.map((k, j) => j === i ? { ...k, unit: e.target.value } : k))}
              />
            </div>
          ))}
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</p>
        ) : null}

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
