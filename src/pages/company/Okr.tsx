/**
 * §9.1 OKR — Company (admin only) + Personal (user own; admin sees all).
 * Health: On Track ≥70%, At Risk 40–69%, Off Track <40%.
 * Weekly nudge via MIRAI if no update in 7 days (handled by cron, not here).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { useOkrsWithKRs } from '@/lib/hooks';

type KR = {
  id: string;
  okr_id: string;
  title: string;
  metric_type: string | null;
  current_value: number;
  target_value: number;
  unit: string | null;
};

type OKR = {
  id: string;
  scope: 'company' | 'personal';
  employee_id: string | null;
  period: string;
  objective: string;
  owner_id: string | null;
  key_results: KR[];
};

function progress(kr: KR): number {
  if (!kr.target_value) return 0;
  return Math.max(0, Math.min(100, Math.round((kr.current_value / kr.target_value) * 100)));
}

function avgProgress(krs: KR[]): number {
  if (krs.length === 0) return 0;
  return Math.round(krs.reduce((s, k) => s + progress(k), 0) / krs.length);
}

function health(pct: number) {
  if (pct >= 70) return { label: 'On Track', color: '#22C55E' };
  if (pct >= 40) return { label: 'At Risk', color: '#D97706' };
  return { label: 'Off Track', color: '#EF4444' };
}

export function OkrPage() {
  const { isAdmin, profile } = useAuth();
  const [scope, setScope] = useState<'company' | 'personal'>('personal');
  const [showForm, setShowForm] = useState(false);
  const okrs = useOkrsWithKRs(scope);

  const data = (okrs.data ?? []) as OKR[];
  const visible =
    scope === 'personal' && !isAdmin && profile?.id
      ? data.filter((o) => o.employee_id === profile.id)
      : data;

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
            {scope === 'personal' || isAdmin ? (
              <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
                + Obyektiv
              </button>
            ) : null}
          </>
        }
      />

      {showForm ? (
        <CreateOkrForm
          scope={scope}
          isAdmin={isAdmin}
          onDone={() => setShowForm(false)}
        />
      ) : null}

      {visible.length === 0 ? (
        <EmptyState title="OKR yoxdur" body="İlk məqsədi yarat — Key Results-larla bağla." />
      ) : (
        <ul className="space-y-3">
          {visible.map((o) => {
            const pct = avgProgress(o.key_results);
            const h = health(pct);
            return (
              <li key={o.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-h3">{o.objective}</h3>
                    <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
                      {o.period} · {o.scope === 'company' ? 'Şirkət' : 'Şəxsi'}
                    </div>
                  </div>
                  <span className="chip" style={{ color: h.color, borderColor: h.color }}>
                    {h.label} {pct}%
                  </span>
                </div>
                {o.key_results.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {o.key_results.map((kr) => (
                      <KrRow key={kr.id} kr={kr} canEdit={isAdmin || o.employee_id === profile?.id} />
                    ))}
                  </ul>
                ) : (
                  <div className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
                    Key Results əlavə edilməyib.
                  </div>
                )}
                <KrAddInline okrId={o.id} canEdit={isAdmin || o.employee_id === profile?.id} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function KrRow({ kr, canEdit }: { kr: KR; canEdit: boolean }) {
  const qc = useQueryClient();
  const pct = progress(kr);
  const upd = useMutation({
    mutationFn: async (newValue: number) => {
      const { error } = await supabase
        .from('key_results')
        .update({ current_value: newValue, updated_at: new Date().toISOString() })
        .eq('id', kr.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs-with-krs'] }),
  });

  return (
    <li className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-body truncate">{kr.title}</div>
        <div className="h-2 mt-1" style={{ background: 'var(--line-soft)', borderRadius: 4 }}>
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: 'var(--brand-action)',
              borderRadius: 4,
            }}
          />
        </div>
      </div>
      <div className="text-meta" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 90 }}>
        {kr.current_value} / {kr.target_value} {kr.unit ?? ''}
      </div>
      {canEdit ? (
        <input
          className="input"
          type="number"
          step="0.1"
          style={{ width: 90 }}
          defaultValue={kr.current_value}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v !== kr.current_value) upd.mutate(v);
          }}
        />
      ) : null}
    </li>
  );
}

function KrAddInline({ okrId, canEdit }: { okrId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !Number.isFinite(Number(target))) throw new Error();
      const { error } = await supabase.from('key_results').insert({
        okr_id: okrId,
        title: title.trim(),
        target_value: Number(target),
        current_value: 0,
        unit: unit.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setTarget('');
      setUnit('');
      qc.invalidateQueries({ queryKey: ['okrs-with-krs'] });
    },
  });

  if (!canEdit) return null;
  if (!open) {
    return (
      <button type="button" className="chip mt-3" onClick={() => setOpen(true)}>
        + Key Result
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input className="input flex-1 min-w-[200px]" placeholder="KR başlığı" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="input" type="number" placeholder="Hədəf" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 120 }} />
      <input className="input" placeholder="vahid" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 100 }} />
      <button className="btn-primary" type="button" onClick={() => create.mutate()}>Yarat</button>
      <button className="btn-outline" type="button" onClick={() => setOpen(false)}>Ləğv</button>
    </div>
  );
}

function CreateOkrForm({
  scope,
  isAdmin,
  onDone,
}: {
  scope: 'company' | 'personal';
  isAdmin: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [objective, setObjective] = useState('');
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!objective.trim()) throw new Error('Obyektiv tələb olunur');
      if (scope === 'company' && !isAdmin) throw new Error('Yalnız admin');
      const { error: e } = await supabase.from('okrs').insert({
        scope,
        objective: objective.trim(),
        period,
        owner_id: profile?.id,
        employee_id: scope === 'personal' ? profile?.id : null,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['okrs-with-krs'] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      className="card mb-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <input
        className="input"
        placeholder="Obyektiv (məs: Müştəri saxlama 90%-ə çatdır)"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
      />
      <input
        className="input"
        placeholder="Q1 2026"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      />
      {error ? (
        <div className="text-meta" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Yarat
        </button>
        <button type="button" className="btn-outline" onClick={onDone}>
          Ləğv
        </button>
      </div>
    </form>
  );
}
