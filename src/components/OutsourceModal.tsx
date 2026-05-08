/**
 * REQ-FIN-07 — create outsource_item. Status defaults to 'order' (Sifariş).
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import { useCreateOutsource, ValidationError } from '@/lib/finance';
import { useProjects } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/db';

export function OutsourceModal({ onClose }: { onClose: () => void }) {
  const projects = useProjects();
  const profiles = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: async (): Promise<Profile[]> =>
      ((await supabase.from('profiles').select('*').eq('is_active', true)).data ?? []) as Profile[],
  });
  const m = useCreateOutsource();
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      await m.mutateAsync({
        project_id: (f.get('project_id') as string) || null,
        work_title: String(f.get('work_title') ?? ''),
        contact_person: (f.get('contact_person') as string) || null,
        contact_company: (f.get('contact_company') as string) || null,
        amount: Number(f.get('amount')),
        payment_method: (f.get('payment_method') as string) || null,
        responsible_user_id: (f.get('responsible_user_id') as string) || null,
        deadline: (f.get('deadline') as string) || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Outsource" onClose={onClose} width={560}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="İş adı *">
          <input name="work_title" type="text" required autoFocus className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Məbləğ (AZN) *">
            <input name="amount" type="number" step="0.01" min="0.01" required className="input" />
          </Field>
          <Field label="Müddət">
            <input name="deadline" type="date" className="input" />
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Əlaqə şəxsi">
            <input name="contact_person" type="text" className="input" />
          </Field>
          <Field label="Şirkət">
            <input name="contact_company" type="text" className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daxili məsul">
            <select name="responsible_user_id" className="input" defaultValue="">
              <option value="">—</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </select>
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
