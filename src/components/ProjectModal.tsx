/**
 * REQ-PROJ-01 / REQ-PROJ-02 — Create project.
 * Backward-planned design_deadline (calendar days, v1) is computed live as
 * the user toggles requires_expertise + sets expertise_deadline.
 */
import { FormEvent, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { computeDesignDeadline, useCreateProject } from '@/lib/work';
import { ValidationError } from '@/lib/finance';
import { useClients } from '@/lib/hooks';
import { PROJECT_PHASES } from '@/lib/labels';
import { ClientModal } from './ClientModal';

type Props = { onClose: () => void; onCreated?: (id: string) => void };

export function ProjectModal({ onClose, onCreated }: Props) {
  const clients = useClients();
  const m = useCreateProject();
  const [err, setErr] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>('');
  const [openClient, setOpenClient] = useState(false);

  const [phases, setPhases] = useState<string[]>(['Konsepsiya', 'SD', 'DD']);
  const [requiresExpertise, setRequiresExpertise] = useState(false);
  const [expertiseDeadline, setExpertiseDeadline] = useState('');
  const [paymentBuffer, setPaymentBuffer] = useState<number>(10);

  const derived = useMemo(() => {
    if (!requiresExpertise || !expertiseDeadline) return null;
    return computeDesignDeadline({
      expertise_deadline: expertiseDeadline,
      payment_buffer_days: paymentBuffer,
    });
  }, [requiresExpertise, expertiseDeadline, paymentBuffer]);

  function togglePhase(p: string) {
    setPhases((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort(
        (a, b) => PROJECT_PHASES.indexOf(a as typeof PROJECT_PHASES[number]) -
          PROJECT_PHASES.indexOf(b as typeof PROJECT_PHASES[number]),
      ),
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      const created = await m.mutateAsync({
        name: String(f.get('name') ?? ''),
        client_id: clientId || null,
        phases,
        requires_expertise: requiresExpertise,
        expertise_deadline: requiresExpertise ? expertiseDeadline || null : null,
        payment_buffer_days: paymentBuffer,
        start_date: (f.get('start_date') as string) || null,
        deadline: (f.get('deadline') as string) || null,
      });
      onCreated?.(created.id);
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Yeni layihə" onClose={onClose} width={620}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Ad *">
          <input name="name" type="text" required className="input" autoFocus />
        </Field>

        <Field label="Müştəri">
          <div className="flex gap-2">
            <select
              className="input flex-1"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">—</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setOpenClient(true)}
              style={{ whiteSpace: 'nowrap' }}
            >
              + Yeni
            </button>
          </div>
        </Field>

        <Field label="Mərhələlər *">
          <div className="flex flex-wrap gap-2 mt-1">
            {PROJECT_PHASES.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip ${phases.includes(p) ? 'chip-brand' : ''}`}
                onClick={() => togglePhase(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlama">
            <input name="start_date" type="date" className="input" />
          </Field>
          <Field label="Deadline">
            <input
              name="deadline"
              type="date"
              className="input"
              defaultValue={derived ?? ''}
              key={derived ?? 'manual'}
            />
          </Field>
        </div>

        {/* REQ-PROJ-02 */}
        <div className="card" style={{ padding: 16, background: 'var(--surface-mist)', border: '1px solid var(--line-soft)' }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresExpertise}
              onChange={(e) => setRequiresExpertise(e.target.checked)}
            />
            <span className="text-body font-medium">Ekspertiza tələb olunur</span>
          </label>

          {requiresExpertise ? (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Ekspertiza tarixi *">
                <input
                  type="date"
                  required={requiresExpertise}
                  value={expertiseDeadline}
                  onChange={(e) => setExpertiseDeadline(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Ödəniş buferi (gün)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={paymentBuffer}
                  onChange={(e) => setPaymentBuffer(Number(e.target.value))}
                  className="input"
                />
              </Field>
              {derived ? (
                <p className="text-meta col-span-2" style={{ color: 'var(--text-muted)' }}>
                  Geriyə-planlanmış dizayn deadline-ı:{' '}
                  <strong style={{ color: 'var(--text)' }}>{derived}</strong>
                  {' '}({paymentBuffer} ödəniş + 30 ekspertiza + 10 düzəliş + 3 çap = {paymentBuffer + 43} gün öncədən)
                </p>
              ) : null}
            </div>
          ) : null}
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

      {openClient ? (
        <ClientModal
          onClose={() => setOpenClient(false)}
          onCreated={(id) => setClientId(id)}
        />
      ) : null}
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
