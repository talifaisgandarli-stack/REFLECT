/**
 * Client detail modal (CRM redesign §6). Opens from a client card or a pipeline
 * card's client badge. Tabs: Layihələr / Əlaqə / Tarixçə. "+ Yeni layihə"
 * creates a Lead-stage project that immediately shows up on the pipeline.
 */
import { useEffect, useState } from 'react';
import type { ClientSummary, InteractionType, ServiceType } from '@/types/db';
import {
  CLIENT_TIER_DESC,
  INTERACTION_LABEL,
  PROJECT_STAGE_LABEL,
  SERVICE_TYPE_LABEL,
} from '@/lib/labels';
import { formatAZN, relativeTime } from '@/lib/format';
import {
  useClientInteractions,
  useClientProjects,
  useCreateProject,
  useLogInteraction,
} from '@/lib/hooks';
import { StageDot, clientColor, initials } from './crmShared';

type Tab = 'projects' | 'interactions' | 'history';

export function ClientModal({
  client,
  onClose,
}: {
  client: ClientSummary;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('projects');
  const projects = useClientProjects(client.id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg"
        style={{ padding: 0, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={client.name}
      >
        {/* Header */}
        <div style={{ padding: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: clientColor(client.id),
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials(client.company || client.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Hierarchy: company → orderer (contact) → tier */}
              <div style={{ fontSize: 16, fontWeight: 500 }}>{client.company || client.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {client.company ? client.name : 'Sifarişçi'}
                {client.tier ? ` · ${CLIENT_TIER_DESC[client.tier]}` : ''}
              </div>
            </div>
            <button type="button" className="chip" onClick={onClose} aria-label="Bağla">
              ✕
            </button>
          </div>

          {/* 3 metrics */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <Metric label="Layihə" value={String(client.total_projects)} />
            <Metric label="Ümumi dəyər" value={formatAZN(client.total_value)} />
            <Metric label="Aktiv" value={String(client.active_projects)} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 16px 0' }} role="tablist">
          {(
            [
              ['projects', 'Layihələr'],
              ['interactions', 'Əlaqə'],
              ['history', 'Tarixçə'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className="chip"
              style={
                tab === k
                  ? { background: 'var(--brand-action)', color: 'var(--brand-text)' }
                  : undefined
              }
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {tab === 'projects' ? (
            <ProjectsTab
              clientId={client.id}
              projects={projects.data ?? []}
              loading={projects.isLoading}
            />
          ) : tab === 'interactions' ? (
            <InteractionsTab clientId={client.id} />
          ) : (
            <InteractionsTab clientId={client.id} historyOnly />
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function ProjectsTab({
  clientId,
  projects,
  loading,
}: {
  clientId: string;
  projects: import('@/types/db').Project[];
  loading: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [service, setService] = useState<'' | ServiceType>('');
  const [value, setValue] = useState('');
  const create = useCreateProject();

  function submit() {
    if (!name.trim()) return;
    create.mutate(
      {
        client_id: clientId,
        name: name.trim(),
        service_type: service || null,
        value: value ? Number(value) : 0,
      },
      {
        onSuccess: () => {
          setName('');
          setService('');
          setValue('');
          setAdding(false);
        },
      },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Yüklənir…</div>
      ) : projects.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hələ layihə yoxdur.</div>
      ) : (
        projects.map((p) => {
          const done = p.stage === 'portfolio' || p.stage === 'udulan';
          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
                opacity: done ? 0.6 : 1,
                borderBottom: '1px solid var(--line-soft)',
              }}
            >
              <StageDot stage={p.stage} />
              <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {PROJECT_STAGE_LABEL[p.stage]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{formatAZN(p.value)}</span>
            </div>
          );
        })
      )}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <input
            className="input"
            placeholder="Layihə adı"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="input"
              style={{ flex: 1 }}
              value={service}
              onChange={(e) => setService(e.target.value as ServiceType | '')}
            >
              <option value="">Xidmət növü</option>
              {(Object.keys(SERVICE_TYPE_LABEL) as ServiceType[]).map((s) => (
                <option key={s} value={s}>
                  {SERVICE_TYPE_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ width: 110 }}
              type="number"
              placeholder="₼ dəyər"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn-primary"
              disabled={create.isPending}
              onClick={submit}
            >
              Yarat
            </button>
            <button type="button" className="btn-outline" onClick={() => setAdding(false)}>
              Ləğv et
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-outline"
          style={{ marginTop: 4, alignSelf: 'flex-start' }}
          onClick={() => setAdding(true)}
        >
          + Yeni layihə
        </button>
      )}
    </div>
  );
}

const INTERACTION_TYPES: InteractionType[] = ['call', 'email', 'meeting', 'whatsapp', 'other'];

function InteractionsTab({
  clientId,
  historyOnly,
}: {
  clientId: string;
  historyOnly?: boolean;
}) {
  const interactions = useClientInteractions(clientId);
  const log = useLogInteraction();
  const [type, setType] = useState<InteractionType>('call');
  const [note, setNote] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!historyOnly ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {INTERACTION_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                style={
                  type === t
                    ? { background: 'var(--brand-action)', color: 'var(--brand-text)' }
                    : undefined
                }
                onClick={() => setType(t)}
              >
                {INTERACTION_LABEL[t]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Qeyd…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={log.isPending}
              onClick={() =>
                log.mutate(
                  { clientId, type, note: note.trim() || undefined },
                  { onSuccess: () => setNote('') },
                )
              }
            >
              Əlavə et
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {interactions.isLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Yüklənir…</div>
        ) : (interactions.data ?? []).length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Qeyd yoxdur.</div>
        ) : (
          (interactions.data ?? []).map((it) => (
            <div
              key={it.id}
              style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 64 }}>
                {INTERACTION_LABEL[it.type]}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-soft)' }}>
                {it.note ?? '—'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {relativeTime(it.occurred_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}