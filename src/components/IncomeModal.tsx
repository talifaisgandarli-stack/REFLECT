/**
 * REQ-FIN-01 — "+ Gəlir" modal: amount, project, client, payment_method, date,
 * invoice_number, note. amount > 0 enforced (REQ-FIN-04).
 *
 * NOTE: PRD says "On save → incomes row + activity_log + receivable status
 * sync." activity_log is handled by DB triggers (0004); receivable status sync
 * is intentionally NOT auto-applied here because PRD does not specify the
 * income↔receivable mapping. Use the markPaid flow (REQ-FIN-03) on the Debitor
 * tab to update receivables explicitly.
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import { useCreateIncome, ValidationError } from '@/lib/finance';
import { useClients, useProjects } from '@/lib/hooks';

type Props = { onClose: () => void };

export function IncomeModal({ onClose }: Props) {
  const projects = useProjects();
  const clients = useClients();
  const m = useCreateIncome();
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    try {
      await m.mutateAsync({
        amount,
        project_id: (f.get('project_id') as string) || null,
        client_id: (f.get('client_id') as string) || null,
        payment_method: (f.get('payment_method') as string) || null,
        occurred_at: (f.get('occurred_at') as string) || undefined,
        invoice_number: (f.get('invoice_number') as string) || null,
        note: (f.get('note') as string) || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Gəlir" onClose={onClose} width={520}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Məbləğ (AZN) *">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="input"
            inputMode="decimal"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarix">
            <input
              name="occurred_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="input"
            />
          </Field>
          <Field label="Ödəniş üsulu">
            <select name="payment_method" className="input" defaultValue="">
              <option value="">—</option>
              <option value="bank">Bank köçürməsi</option>
              <option value="cash">Nağd</option>
              <option value="card">Kart</option>
            </select>
          </Field>
        </div>
        <Field label="Layihə">
          <select name="project_id" className="input" defaultValue="">
            <option value="">—</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Müştəri">
          <select name="client_id" className="input" defaultValue="">
            <option value="">—</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Faktura nömrəsi">
          <input name="invoice_number" type="text" className="input" />
        </Field>
        <Field label="Qeyd">
          <textarea name="note" className="input" style={{ height: 80, padding: 12 }} />
        </Field>

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Ləğv et
          </button>
          <button type="submit" className="btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Saxlanılır…' : 'Saxla'}
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
