/**
 * Create a contract (receivable) for a client — the one-click "+ Müqavilə" flow
 * (CRM↔Finance spec, owner decision 2026-06-25: per-project). Default amount =
 * the client's pipeline forecast (expected_value), so the agreed deal carries
 * over without retyping. Writes to the existing `receivables` table.
 */
import { useState } from 'react';
import type { Client, Project } from '@/types/db';
import { useCreateReceivable } from '@/lib/hooks';

export function CreateReceivableModal({
  client,
  projects,
  onClose,
}: {
  client: Client;
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState<string>('');
  const [amount, setAmount] = useState(client.expected_value ? String(client.expected_value) : '');
  const [dueAt, setDueAt] = useState('');
  const create = useCreateReceivable();

  function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    create.mutate(
      {
        client_id: client.id,
        project_id: projectId || null,
        amount: n,
        due_at: dueAt || null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: 'rgba(14,22,17,0.4)' }} onClick={onClose}>
      <form
        className="card w-full max-w-sm"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <h2 className="text-h2 mb-4">Yeni müqavilə (qaimə)</h2>
        <div className="space-y-3">
          <L label="Layihə">
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Ümumi (layihəsiz)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </L>
          <L label="Müqavilə məbləği (₼) *">
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </L>
          <L label="Son ödəniş tarixi">
            <input className="input" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </L>
        </div>
        {create.isError ? (
          <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>Xəta — yenidən cəhd et.</p>
        ) : null}
        <div className="flex gap-2 mt-5 justify-end">
          <button type="button" className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>Yarat</button>
        </div>
      </form>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
