/**
 * Project create / edit / delete modal (CRM redesign). The single place to enter
 * the data the pipeline + client cards display: company is the client, plus the
 * project's name, service type, value, region and stage. Opened from the
 * pipeline "+ Yeni layihə" button (create) or a card's edit affordance (edit).
 */
import { useState } from 'react';
import type { ClientSummary, Project, ProjectStage, ServiceType } from '@/types/db';
import { PROJECT_STAGE_LABEL, SERVICE_TYPE_LABEL } from '@/lib/labels';
import { useCreateProject, useUpdateProjectField, useDeleteProject } from '@/lib/hooks';

const STAGES: ProjectStage[] = ['lead', 'teklif', 'muzakire', 'icrada', 'portfolio', 'udulan'];

export function ProjectModal({
  mode,
  clients,
  project,
  defaultClientId,
  onClose,
}: {
  mode: 'create' | 'edit';
  clients: ClientSummary[];
  project?: Project;
  defaultClientId?: string;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState(project?.client_id ?? defaultClientId ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [service, setService] = useState<'' | ServiceType>(project?.service_type ?? '');
  const [value, setValue] = useState(project?.value ? String(project.value) : '');
  const [region, setRegion] = useState(project?.region ?? '');
  const [stage, setStage] = useState<ProjectStage>(project?.stage ?? 'lead');
  const [progress, setProgress] = useState(project?.progress ?? 0);
  const [confirmDel, setConfirmDel] = useState(false);

  const create = useCreateProject();
  const update = useUpdateProjectField();
  const del = useDeleteProject();
  const busy = create.isPending || update.isPending || del.isPending;

  const clientsSorted = [...clients].sort((a, b) =>
    (a.company ?? a.name).localeCompare(b.company ?? b.name, 'az'),
  );

  function submit() {
    if (!name.trim()) return;
    if (mode === 'create') {
      if (!clientId) return;
      create.mutate(
        {
          client_id: clientId,
          name: name.trim(),
          service_type: service || null,
          value: value ? Number(value) : 0,
          region: region.trim() || null,
          stage,
        },
        { onSuccess: onClose },
      );
    } else if (project) {
      update.mutate(
        {
          id: project.id,
          patch: {
            name: name.trim(),
            service_type: service || null,
            value: value ? Number(value) : 0,
            region: region.trim() || null,
            stage,
            progress,
          },
        },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24, maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-h2 mb-4">{mode === 'create' ? 'Yeni layihə' : 'Layihəni redaktə et'}</h2>
        <div className="space-y-3">
          <L label="Müştəri (şirkət) *">
            <select
              className="input"
              value={clientId}
              disabled={mode === 'edit'}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">Seç…</option>
              {clientsSorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company ? `${c.company} — ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </L>
          <L label="Layihə adı *">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Məs. İdarə binası bərpası"
              required
              autoFocus
            />
          </L>
          <div style={{ display: 'flex', gap: 8 }}>
            <L label="Xidmət növü" style={{ flex: 1 }}>
              <select
                className="input"
                value={service}
                onChange={(e) => setService(e.target.value as ServiceType | '')}
              >
                <option value="">—</option>
                {(Object.keys(SERVICE_TYPE_LABEL) as ServiceType[]).map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_TYPE_LABEL[s]}
                  </option>
                ))}
              </select>
            </L>
            <L label="Dəyər (₼)" style={{ width: 130 }}>
              <input
                className="input"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </L>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <L label="Region" style={{ flex: 1 }}>
              <input
                className="input"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Məs. Ağdam, Füzuli"
              />
            </L>
            <L label="Mərhələ" style={{ width: 130 }}>
              <select
                className="input"
                value={stage}
                onChange={(e) => setStage(e.target.value as ProjectStage)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </L>
          </div>
          {stage === 'icrada' ? (
            <L label={`İrəliləyiş: ${progress}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </L>
          ) : null}
        </div>

        {(create.isError || update.isError) ? (
          <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>
            Xəta baş verdi — yenidən cəhd et.
          </p>
        ) : null}

        <div className="flex gap-2 mt-5 justify-between items-center">
          {mode === 'edit' ? (
            confirmDel ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--error)' }}>Əminsən?</span>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                  disabled={busy}
                  onClick={() => project && del.mutate(project.id, { onSuccess: onClose })}
                >
                  Bəli, sil
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn-outline"
                style={{ color: 'var(--error)' }}
                onClick={() => setConfirmDel(true)}
              >
                🗑 Sil
              </button>
            )
          ) : (
            <span />
          )}
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-outline" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {mode === 'create' ? 'Yarat' : 'Saxla'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

function L({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
