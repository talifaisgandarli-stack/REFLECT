import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import {
  backwardPlannedDeadline,
  useClients,
  useCreateProject,
  useProjects,
} from '@/lib/hooks';
import { Mascot } from '@/components/Mascot';
import { PROJECT_PHASES, PROJECT_STATUS_LABEL } from '@/lib/labels';
import { formatDate } from '@/lib/format';

const FOLDER_TONE = ['bg-grad-folder-sage', 'bg-grad-folder-lime', 'bg-grad-folder-forest', 'bg-grad-folder-peach', 'bg-grad-folder-lavender'];

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHead
        meta={`${projects.length} layihə`}
        title="Layihələr"
        actions={
          <>
            <input className="input max-w-[240px]" placeholder="Axtar…" />
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni layihə
            </button>
          </>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="Hələ layihə yoxdur"
          body="Yeni layihə yarat — fazaları və müştərini seç, MIRAI tapşırıqları təklif edəcək."
          cta={<button className="btn-primary">+ Yeni layihə</button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => {
            const tone = FOLDER_TONE[i % FOLDER_TONE.length];
            const dark = tone === 'bg-grad-folder-forest';
            return (
              <Link
                key={p.id}
                to={`/layihelər/${p.id}`}
                className={`card-interactive rounded-card p-5 min-h-[180px] flex flex-col justify-between ${tone}`}
                style={{ color: dark ? 'var(--canvas)' : 'var(--ink)' }}
              >
                <div>
                  <span
                    className="chip"
                    style={{
                      background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,22,17,0.06)',
                      color: dark ? 'var(--canvas)' : 'var(--ink)',
                    }}
                  >
                    {p.phases[0] ?? '—'}
                  </span>
                </div>
                <div>
                  <h3 className="text-h3 font-bold">{p.name}</h3>
                  <div className="text-meta mt-1 opacity-80">
                    {PROJECT_STATUS_LABEL[p.status]} · {p.deadline ?? 'tarixsiz'}
                  </div>
                </div>
              </Link>
            );
          })}
          <button
            className="rounded-card p-5 min-h-[180px] flex flex-col items-center justify-center gap-2 card-interactive"
            style={{ background: 'transparent', border: '1px dashed var(--line)' }}
            onClick={() => setCreating(true)}
          >
            <Mascot size={48} />
            <span className="text-ui">+ Yeni layihə</span>
          </button>
        </div>
      )}

      {creating ? <CreateProjectModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const create = useCreateProject();
  const { data: clients = [] } = useClients();
  const nav = useNavigate();

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [phases, setPhases] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [requiresExpertise, setRequiresExpertise] = useState(false);
  const [expertiseDeadline, setExpertiseDeadline] = useState('');
  const [paymentBuffer, setPaymentBuffer] = useState('10');
  const [err, setErr] = useState<string | null>(null);

  const designDeadline = useMemo(
    () =>
      requiresExpertise
        ? backwardPlannedDeadline(expertiseDeadline || null, Number(paymentBuffer) || 0)
        : null,
    [requiresExpertise, expertiseDeadline, paymentBuffer],
  );

  function togglePhase(p: string) {
    setPhases((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function applyBackward() {
    if (designDeadline) setDeadline(designDeadline);
  }

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr('Ad lazımdır.');
    if (phases.size === 0) return setErr('Ən azı bir mərhələ seç.');
    if (deadline && startDate && deadline < startDate) {
      return setErr('Deadline başlanğıcdan əvvəl ola bilməz.');
    }
    const buf = Number(paymentBuffer);
    if (!Number.isInteger(buf) || buf < 0) {
      return setErr('Ödəniş buferi tam müsbət ədəd olmalıdır.');
    }
    if (requiresExpertise && !expertiseDeadline) {
      return setErr('Ekspertiza tələb olunursa, expertise_deadline lazımdır.');
    }
    create.mutate(
      {
        name: name.trim(),
        client_id: clientId || null,
        phases: PROJECT_PHASES.filter((p) => phases.has(p)),
        start_date: startDate || null,
        deadline: deadline || null,
        requires_expertise: requiresExpertise,
        expertise_deadline: requiresExpertise ? expertiseDeadline : null,
        payment_buffer_days: buf,
      },
      {
        onSuccess: (id) => {
          onClose();
          nav(`/layihelər/${id}`);
        },
        onError: (e) => setErr((e as Error).message),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[560px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">+ Yeni layihə</h2>

        <Field label="Ad">
          <input
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Müştəri">
          <select
            className="input w-full"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">— Yoxdur —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Mərhələlər
          </div>
          <div className="flex flex-wrap gap-1">
            {PROJECT_PHASES.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip ${phases.has(p) ? 'chip-brand' : ''}`}
                onClick={() => togglePhase(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlanğıc">
            <input
              className="input w-full"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Deadline">
            <input
              className="input w-full"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={requiresExpertise}
            onChange={(e) => setRequiresExpertise(e.target.checked)}
          />
          <span className="text-body">Ekspertiza tələb olunur</span>
        </label>

        {requiresExpertise ? (
          <div
            className="rounded-card p-3 mb-3"
            style={{ background: 'var(--surface-mist)' }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ekspertiza deadline">
                <input
                  className="input w-full"
                  type="date"
                  value={expertiseDeadline}
                  onChange={(e) => setExpertiseDeadline(e.target.value)}
                />
              </Field>
              <Field label="Ödəniş buferi (gün)">
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  value={paymentBuffer}
                  onChange={(e) => setPaymentBuffer(e.target.value)}
                />
              </Field>
            </div>
            <div className="text-meta mb-1" style={{ color: 'var(--text-muted)' }}>
              Geri-planlama: ekspertiza − ödəniş buferi − 30 (gözləmə) − 10 (yenidən
              baxış) − 3 (çap hazırlığı)
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-body">
                Layihə deadline-i:{' '}
                <strong>{designDeadline ? formatDate(designDeadline) : '—'}</strong>
              </div>
              {designDeadline ? (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={applyBackward}
                  disabled={deadline === designDeadline}
                >
                  Tətbiq et
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {err ? (
          <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
            {err}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button className="btn-primary" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}
