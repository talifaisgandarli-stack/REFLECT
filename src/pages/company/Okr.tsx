/**
 * OKR (PRD §M9.1).
 * - Company OKRs: admin-only edit; everyone reads
 * - Personal OKRs: self-edit; admin sees all
 * - Health: On Track ≥70%, At Risk 40-69%, Off Track <40% (PRD spec)
 * - KR progress = current_value / target_value clamped 0-100
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';

type Scope = 'company' | 'personal';

type OkrRow = {
  id: string;
  scope: Scope;
  employee_id: string | null;
  period: string;
  objective: string;
  owner_id: string | null;
  created_at: string;
};

type KrRow = {
  id: string;
  okr_id: string;
  title: string;
  metric_type: string | null;
  current_value: number;
  target_value: number;
  unit: string | null;
  updated_at: string;
};

function krProgress(kr: KrRow): number {
  if (!kr.target_value) return 0;
  return Math.max(0, Math.min(100, (Number(kr.current_value) / Number(kr.target_value)) * 100));
}

function avgProgress(krs: KrRow[]): number {
  if (krs.length === 0) return 0;
  return krs.reduce((s, k) => s + krProgress(k), 0) / krs.length;
}

function healthLabel(pct: number): { label: string; color: string } {
  if (pct >= 70) return { label: 'On Track', color: '#22C55E' };
  if (pct >= 40) return { label: 'At Risk', color: 'var(--state-warn)' };
  return { label: 'Off Track', color: '#EF4444' };
}

function currentPeriod(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

export function OkrPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>('company');
  const [creating, setCreating] = useState(false);

  const okrs = useQuery({
    queryKey: ['okrs', scope, profile?.id],
    queryFn: async (): Promise<OkrRow[]> => {
      let q = supabase.from('okrs').select('*').eq('scope', scope).order('period', { ascending: false });
      if (scope === 'personal' && !isAdmin && profile?.id) {
        q = q.eq('employee_id', profile.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OkrRow[];
    },
  });

  const krs = useQuery({
    queryKey: ['krs', (okrs.data ?? []).map((o) => o.id).join(',')],
    enabled: (okrs.data ?? []).length > 0,
    queryFn: async (): Promise<KrRow[]> => {
      const ids = (okrs.data ?? []).map((o) => o.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('key_results').select('*').in('okr_id', ids);
      if (error) throw error;
      return (data ?? []) as KrRow[];
    },
  });

  const krMap = useMemo(() => {
    const m = new Map<string, KrRow[]>();
    for (const k of krs.data ?? []) {
      const list = m.get(k.okr_id) ?? [];
      list.push(k);
      m.set(k.okr_id, list);
    }
    return m;
  }, [krs.data]);

  const canCreate = scope === 'company' ? isAdmin : !!profile?.id;

  return (
    <>
      <PageHead
        meta="Q əsasında — On Track ≥70% / At Risk ≥40% / Off Track"
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
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Obyektiv
              </button>
            ) : null}
          </>
        }
      />

      {(okrs.data ?? []).length === 0 ? (
        <EmptyState
          title="OKR yoxdur"
          body="İlk məqsədi yarat — Key Results-larla bağla."
          cta={
            canCreate ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni obyektiv
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {(okrs.data ?? []).map((o) => {
            const list = krMap.get(o.id) ?? [];
            const pct = avgProgress(list);
            const h = healthLabel(pct);
            return (
              <li key={o.id} className="card">
                <header className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-h3">{o.objective}</h3>
                    <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
                      {o.period}
                    </div>
                  </div>
                  <span
                    className="chip shrink-0"
                    style={{ background: `${h.color}1f`, color: h.color }}
                  >
                    {Math.round(pct)}% · {h.label}
                  </span>
                </header>

                <div
                  className="mt-3 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--surface-mist)' }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: h.color,
                      transition: 'width 220ms var(--ease-out)',
                    }}
                  />
                </div>

                {list.length > 0 ? (
                  <ul className="mt-4 divide-y" style={{ borderColor: 'var(--line-soft)' }}>
                    {list.map((k) => (
                      <KeyResultRow key={k.id} kr={k} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
                    Hələ Key Result əlavə olunmayıb.
                  </p>
                )}

                <KeyResultAdder
                  okrId={o.id}
                  onAdded={() => qc.invalidateQueries({ queryKey: ['krs'] })}
                />
              </li>
            );
          })}
        </ul>
      )}

      {creating ? (
        <ObjectiveModal
          scope={scope}
          onClose={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['okrs'] });
          }}
        />
      ) : null}
    </>
  );
}

function KeyResultRow({ kr }: { kr: KrRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(kr.current_value.toString());

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(val.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new Error('Müsbət rəqəm gir');
      const { error } = await supabase
        .from('key_results')
        .update({ current_value: n, updated_at: new Date().toISOString() })
        .eq('id', kr.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['krs'] });
    },
  });

  const pct = krProgress(kr);
  const h = healthLabel(pct);

  return (
    <li className="py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-body truncate">{kr.title}</div>
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {editing ? (
            <span className="inline-flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className="input"
                style={{ height: 28, width: 80, fontVariantNumeric: 'tabular-nums' }}
              />
              / {kr.target_value} {kr.unit ?? ''}
              <button
                type="button"
                className="chip chip-brand"
                onClick={() => save.mutate()}
                disabled={save.isPending}
                style={{ height: 22 }}
              >
                ✓
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setEditing(false);
                  setVal(kr.current_value.toString());
                }}
                style={{ height: 22 }}
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="hover:underline"
              onClick={() => setEditing(true)}
              style={{ fontVariantNumeric: 'tabular-nums', color: 'inherit' }}
            >
              {kr.current_value} / {kr.target_value} {kr.unit ?? ''}
            </button>
          )}
        </div>
      </div>
      <span
        className="text-meta shrink-0"
        style={{ color: h.color, fontVariantNumeric: 'tabular-nums' }}
      >
        {Math.round(pct)}%
      </span>
    </li>
  );
}

function KeyResultAdder({
  okrId,
  onAdded,
}: {
  okrId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const t = Number(target.replace(',', '.'));
      if (!Number.isFinite(t) || t <= 0) throw new Error('Hədəf müsbət rəqəm olmalıdır');
      const { error } = await supabase.from('key_results').insert({
        okr_id: okrId,
        title: title.trim(),
        current_value: 0,
        target_value: t,
        unit: unit || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle('');
      setTarget('');
      setUnit('');
      setOpen(false);
      onAdded();
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost mt-3"
        onClick={() => setOpen(true)}
        style={{ height: 32, padding: '0 12px', color: 'var(--brand-text)' }}
      >
        + Key Result
      </button>
    );
  }

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <input
        className="input flex-1 min-w-[200px]"
        placeholder="Key Result başlığı"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <input
        className="input"
        type="text"
        inputMode="decimal"
        placeholder="Hədəf"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{ width: 100, fontVariantNumeric: 'tabular-nums' }}
      />
      <input
        className="input"
        placeholder="Vahid (məs. AZN, %)"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        style={{ width: 140 }}
      />
      <button type="submit" className="btn-primary" disabled={save.isPending}>
        {save.isPending ? '…' : 'Əlavə et'}
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(false)}
        style={{ height: 40 }}
      >
        Geri
      </button>
    </form>
  );
}

function ObjectiveModal({
  scope,
  onClose,
}: {
  scope: Scope;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [objective, setObjective] = useState('');
  const [period, setPeriod] = useState(currentPeriod());

  const save = useMutation({
    mutationFn: async () => {
      if (!objective.trim()) throw new Error('Obyektiv mətnini yaz');
      const { error } = await supabase.from('okrs').insert({
        scope,
        objective: objective.trim(),
        period,
        employee_id: scope === 'personal' ? profile?.id ?? null : null,
        owner_id: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni obyektiv"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">+ Obyektiv ({scope === 'company' ? 'Şirkət' : 'Şəxsi'})</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Obyektiv
            </span>
            <input
              className="input"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Dövr
            </span>
            <input
              className="input"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-Q2"
            />
          </label>
        </div>
        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !objective}>
            {save.isPending ? 'Yadda saxlanılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
