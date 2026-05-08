/**
 * "+ Xərc" modal — REQ-FIN-04 amount > 0 enforced at form layer.
 * Recurring xərclər go through `recurring_expenses` (REQ-FIN-05); this modal
 * creates a single one-off `expenses` row.
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import { useCreateExpense, ValidationError } from '@/lib/finance';
import { useProjects } from '@/lib/hooks';

type Props = { onClose: () => void };

export function ExpenseModal({ onClose }: Props) {
  const projects = useProjects();
  const m = useCreateExpense();
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      await m.mutateAsync({
        amount: Number(f.get('amount')),
        project_id: (f.get('project_id') as string) || null,
        category: (f.get('category') as string) || null,
        vendor: (f.get('vendor') as string) || null,
        occurred_at: (f.get('occurred_at') as string) || undefined,
        note: (f.get('note') as string) || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Xərc" onClose={onClose} width={520}>
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
          <Field label="Kateqoriya">
            <input name="category" type="text" className="input" placeholder="Ofis, lisenziyalar…" />
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
        <Field label="Təchizatçı">
          <input name="vendor" type="text" className="input" />
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
