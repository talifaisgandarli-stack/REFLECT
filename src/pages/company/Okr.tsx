import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import {
  useCreateKeyResult,
  useCreateOkr,
  useKeyResultsForOkrs,
  useOkrs,
  useUpdateKeyResult,
} from '@/lib/hooks';
import type { KeyResult, Okr, OkrScope } from '@/types/db';

const TABS: OkrScope[] = ['company', 'personal'];

export function OkrPage() {
  const { isAdmin, profile } = useAuth();
  const [scope, setScope] = useState<OkrScope>('personal');
  const [creating, setCreating] = useState(false);

  // Personal scope: non-admin sees only own (RLS); admin sees all personal.
  const { data: okrs = [], isLoading } = useOkrs({ scope });
  const { data: keyResults = [] } = useKeyResultsForOkrs(okrs.map((o) => o.id));

  const krByOkr = useMemo(() => {
    const m = new Map<string, KeyResult[]>();
    for (const k of keyResults) {
      const arr = m.get(k.okr_id) ?? [];
      arr.push(k);
      m.set(k.okr_id, arr);
    }
    return m;
  }, [keyResults]);

  // Admin can create company OKRs; user can create own personal OKRs;
  // RLS rejects everything else.
  const canCreate =
    scope === 'personal' ? !!profile?.id : isAdmin;

  return (
    <>
      <PageHead
        meta="Q əsasında"
        title="OKR"
        actions={
          <>
            {TABS.map((s) => (
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

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : okrs.length === 0 ? (
        <EmptyState
          title="OKR yoxdur"
          body={
            scope === 'company'
              ? 'Şirkət obyektivləri admin tərəfindən yaradılır.'
              : 'İlk şəxsi məqsədini yarat — Key Results-larla bağla.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {okrs.map((o) => (
            <OkrCard key={o.id} okr={o} keyResults={krByOkr.get(o.id) ?? []} />
          ))}
        </ul>
      )}

      {creating ? (
        <CreateOkrModal scope={scope} onClose={() => setCreating(false)} />
      ) : null}
    </>
  );
}

function progressOf(krs: KeyResult[]): number {
  if (krs.length === 0) return 0;
  const total = krs.reduce((sum, k) => {
    if (!(k.target_value > 0)) return sum;
    return sum + Math.min(1, Number(k.current_value) / Number(k.target_value));
  }, 0);
  return Math.round((total / krs.length) * 100);
}

function healthOf(pct: number): { label: string; color: string } {
  if (pct >= 70) return { label: 'On Track', color: 'var(--brand-text)' };
  if (pct >= 40) return { label: 'At Risk', color: '#D97706' };
  return { label: 'Off Track', color: '#B91C1C' };
}

function OkrCard({ okr, keyResults }: { okr: Okr; keyResults: KeyResult[] }) {
  const { profile, isAdmin } = useAuth();
  const pct = progressOf(keyResults);
  const health = healthOf(pct);
  const canEdit =
    isAdmin || (okr.scope === 'personal' && okr.employee_id === profile?.id);

  return (
    <li className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-h3">{okr.objective}</h3>
          <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
            {okr.period}
            {okr.scope === 'personal' && okr.employee_id ? (
              <>
                {' · '}
                <span className="font-mono">{okr.employee_id.slice(0, 8)}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-h2"
            style={{ fontVariantNumeric: 'tabular-nums', color: health.color }}
          >
            {pct}%
          </div>
          <div className="text-meta" style={{ color: health.color }}>
            {health.label}
          </div>
        </div>
      </div>

      {keyResults.length === 0 ? (
        canEdit ? (
          <AddKeyResult okrId={okr.id} />
        ) : (
          <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
            Key Results yoxdur.
          </p>
        )
      ) : (
        <ul className="mt-4 space-y-3">
          {keyResults.map((k) => (
            <KeyResultRow key={k.id} kr={k} canEdit={canEdit} />
          ))}
          {canEdit ? <AddKeyResult okrId={okr.id} /> : null}
        </ul>
      )}
    </li>
  );
}

function KeyResultRow({ kr, canEdit }: { kr: KeyResult; canEdit: boolean }) {
  const update = useUpdateKeyResult();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const value = editing ? draft : String(kr.current_value);
  const pct =
    kr.target_value > 0
      ? Math.min(100, Math.round((Number(kr.current_value) / Number(kr.target_value)) * 100))
      : 0;

  function save() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) {
      setDraft(null);
      return;
    }
    update.mutate({ id: kr.id, current_value: n }, { onSettled: () => setDraft(null) });
  }

  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <div className="text-body min-w-0 flex-1 truncate">{kr.title}</div>
        <div
          className="flex items-center gap-1 text-body shrink-0"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {canEdit ? (
            <input
              className="input"
              style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
              value={value}
              type="number"
              min={0}
              onFocus={() => setDraft(String(kr.current_value))}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setDraft(null);
              }}
              disabled={update.isPending}
            />
          ) : (
            <span>{kr.current_value}</span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>
            / {kr.target_value} {kr.unit ?? ''}
          </span>
        </div>
      </div>
      <div
        className="mt-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--line-soft)' }}
      >
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: 'var(--brand-action)',
            transition: 'width 200ms',
          }}
        />
      </div>
    </li>
  );
}

function AddKeyResult({ okrId }: { okrId: string }) {
  const create = useCreateKeyResult();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  if (!open) {
    return (
      <button
        className="btn-outline mt-3"
        style={{ fontSize: 12 }}
        onClick={() => setOpen(true)}
      >
        + Key Result
      </button>
    );
  }

  function submit() {
    const n = Number(target);
    if (!title.trim() || !Number.isFinite(n) || n <= 0) return;
    create.mutate(
      { okr_id: okrId, title: title.trim(), target_value: n, unit: unit.trim() || null },
      {
        onSuccess: () => {
          setTitle('');
          setTarget('');
          setUnit('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <div className="mt-3 flex gap-2 flex-wrap items-center">
      <input
        className="input flex-1 min-w-[160px]"
        placeholder="Key Result başlığı"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <input
        className="input"
        style={{ width: 100 }}
        placeholder="Hədəf"
        type="number"
        min={0}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      <input
        className="input"
        style={{ width: 80 }}
        placeholder="Vahid"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      />
      <button className="btn-primary" disabled={create.isPending} onClick={submit}>
        Əlavə et
      </button>
      <button className="btn-outline" onClick={() => setOpen(false)}>
        Ləğv
      </button>
    </div>
  );
}

function CreateOkrModal({ scope, onClose }: { scope: OkrScope; onClose: () => void }) {
  const { profile } = useAuth();
  const create = useCreateOkr();
  const [objective, setObjective] = useState('');
  const [period, setPeriod] = useState(currentQuarter());
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!objective.trim()) {
      setErr('Obyektiv boş ola bilməz.');
      return;
    }
    create.mutate(
      {
        scope,
        objective: objective.trim(),
        period: period.trim() || currentQuarter(),
        employee_id: scope === 'personal' ? profile?.id ?? null : null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-1">
          {scope === 'company' ? 'Şirkət obyektivi' : 'Şəxsi obyektiv'}
        </h2>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          Obyektiv yarat, sonra Key Results əlavə et.
        </p>
        <label className="block mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Obyektiv
          </div>
          <input
            className="input w-full"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Dövr
          </div>
          <input
            className="input w-full"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="Q2 2026"
          />
        </label>
        {err ? <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>{err}</div> : null}
        <div className="flex justify-end gap-2 mt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button className="btn-primary" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Yazılır…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}
