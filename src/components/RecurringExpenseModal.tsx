/**
 * REQ-FIN-05 — create a recurring_expenses rule. The pg_cron job that
 * materializes monthly entries into `expenses` is a separate piece (PRD says
 * pg_cron); this modal is the admin authoring surface.
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import {
  RECURRING_PERIOD_LABEL,
  RecurringPeriod,
  useCreateRecurringExpense,
  ValidationError,
} from '@/lib/finance';

export function RecurringExpenseModal({ onClose }: { onClose: () => void }) {
  const m = useCreateRecurringExpense();
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      await m.mutateAsync({
        label: String(f.get('label') ?? ''),
        amount: Number(f.get('amount')),
        period: f.get('period') as RecurringPeriod,
        next_run_at: new Date(String(f.get('next_run_at')) + 'T00:00:00Z').toISOString(),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Sabit xərc" onClose={onClose} width={460}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Ad *">
          <input name="label" type="text" required autoFocus className="input" placeholder="Ofis kirayəsi" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Məbləğ (AZN) *">
            <input name="amount" type="number" step="0.01" min="0.01" required className="input" />
          </Field>
          <Field label="Dövr *">
            <select name="period" required className="input" defaultValue="monthly">
              {(Object.keys(RECURRING_PERIOD_LABEL) as RecurringPeriod[]).map((p) => (
                <option key={p} value={p}>{RECURRING_PERIOD_LABEL[p]}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Növbəti çıxarış *">
          <input
            name="next_run_at"
            type="date"
            required
            className="input"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>

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
