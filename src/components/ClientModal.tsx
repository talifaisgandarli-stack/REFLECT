/**
 * REQ-CRM-01 — create client. Also satisfies "select/create inline" inside
 * REQ-PROJ-01 (ProjectModal passes onCreated to bind the new client).
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import { useCreateClient } from '@/lib/crm';
import { ValidationError } from '@/lib/finance';

type Props = { onClose: () => void; onCreated?: (id: string, name: string) => void };

export function ClientModal({ onClose, onCreated }: Props) {
  const m = useCreateClient();
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      const created = await m.mutateAsync({
        name: String(f.get('name') ?? ''),
        company: (f.get('company') as string) || null,
        email: (f.get('email') as string) || null,
        phone: (f.get('phone') as string) || null,
        expected_value: f.get('expected_value') ? Number(f.get('expected_value')) : null,
      });
      onCreated?.(created.id, created.name);
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Yeni müştəri" onClose={onClose} width={520}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Ad *">
          <input name="name" type="text" required autoFocus className="input" />
        </Field>
        <Field label="Şirkət">
          <input name="company" type="text" className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input name="email" type="email" className="input" />
          </Field>
          <Field label="Telefon">
            <input name="phone" type="tel" className="input" />
          </Field>
        </div>
        <Field label="Gözlənilən dəyər (AZN)">
          <input name="expected_value" type="number" step="0.01" min="0" className="input" />
        </Field>

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Ləğv et
          </button>
          <button type="submit" className="btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Yaradılır…' : 'Yarat'}
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
