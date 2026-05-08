/**
 * OKR creation modal — PRD §9.1.
 *
 * Personal scope is forced to the caller (RLS guards this server-side too).
 * Company scope is admin-only at the page level; this modal trusts the
 * caller's gate.
 *
 * Multiple Key Results in one go — PRD doesn't bound the count, but anything
 * past 5 is a smell; we don't enforce a hard cap, we just don't pre-render
 * empty slots beyond 3.
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import { useCreateOkr, type OkrScope } from '@/lib/okr';
import { ValidationError } from '@/lib/finance';

type DraftKR = { title: string; target_value: string; current_value: string; unit: string };

const EMPTY_KR: DraftKR = { title: '', target_value: '', current_value: '0', unit: '' };

export function OkrModal({
  scope,
  defaultPeriod,
  onClose,
}: {
  scope: OkrScope;
  defaultPeriod?: string;
  onClose: () => void;
}) {
  const m = useCreateOkr();
  const [period, setPeriod] = useState(defaultPeriod ?? defaultQuarter());
  const [objective, setObjective] = useState('');
  const [krs, setKrs] = useState<DraftKR[]>([{ ...EMPTY_KR }, { ...EMPTY_KR }, { ...EMPTY_KR }]);
  const [err, setErr] = useState<string | null>(null);

  function setKr(i: number, patch: Partial<DraftKR>) {
    setKrs((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    try {
      const filled = krs
        .filter((k) => k.title.trim() || k.target_value)
        .map((k) => ({
          title: k.title,
          target_value: Number(k.target_value),
          current_value: k.current_value ? Number(k.current_value) : 0,
          unit: k.unit.trim() || null,
        }));
      await m.mutateAsync({
        scope,
        period,
        objective,
        key_results: filled,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title={scope === 'company' ? '+ Şirkət OKR' : '+ Şəxsi OKR'} onClose={onClose} width={560}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period *">
            <input
              type="text"
              required
              className="input"
              placeholder="2026 Q2"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Obyektiv *">
          <textarea
            required
            className="input"
            style={{ height: 80, padding: 12 }}
            placeholder="Məsələn: Q2-də 20% böyümək"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </Field>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Key Results
            </span>
            <button
              type="button"
              className="btn-ghost text-meta"
              onClick={() => setKrs((r) => [...r, { ...EMPTY_KR }])}
            >
              + KR
            </button>
          </div>
          <div className="space-y-2">
            {krs.map((kr, i) => (
              <div
                key={i}
                className="grid gap-2"
                style={{ gridTemplateColumns: '1fr 100px 100px 80px' }}
              >
                <input
                  className="input"
                  placeholder={`KR ${i + 1} başlığı`}
                  value={kr.title}
                  onChange={(e) => setKr(i, { title: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="Hədəf"
                  value={kr.target_value}
                  onChange={(e) => setKr(i, { target_value: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="Cari"
                  value={kr.current_value}
                  onChange={(e) => setKr(i, { current_value: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Vahid"
                  value={kr.unit}
                  onChange={(e) => setKr(i, { unit: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Ləğv et
          </button>
          <button type="submit" className="btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Saxlanılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function defaultQuarter(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y} Q${q}`;
}
