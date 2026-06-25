/**
 * Client detail modal (PRD Module 6 / REQ-CRM-05, rendered as a modal per the
 * 2026-06-24 redesign). Tabs: Layihələr (read-only list of the client's real
 * architectural projects, linking into the Layihələr module) / Əlaqə / Tarixçə.
 * Projects are NOT created here — that lives in the Layihələr module.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Client, InteractionType } from '@/types/db';
import {
  CLIENT_STAGE_LABEL,
  CLIENT_TIER_DESC,
  INTERACTION_LABEL,
  PROJECT_STATUS_LABEL,
  clientValueLabel,
} from '@/lib/labels';
import { formatAZN, relativeTime } from '@/lib/format';
import {
  useClientInteractions,
  useClientProjects,
  useClientStageHistory,
  useLogInteraction,
} from '@/lib/hooks';
import { clientColor, initials } from './crmShared';

type Tab = 'projects' | 'interactions' | 'history';

export function ClientModal({
  client,
  stat,
  onClose,
}: {
  client: Client;
  stat?: { total: number; active: number };
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('projects');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(14,22,17,0.4)' }} onClick={onClose}>
      <div
        className="card w-full max-w-lg"
        style={{ padding: 0, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={client.company || client.name}
      >
        <div style={{ padding: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden
              style={{ width: 40, height: 40, borderRadius: '50%', background: clientColor(client.id), color: '#fff', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {initials(client.company || client.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{client.company || client.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {client.company ? client.name : 'Sifarişçi'}
                {client.tier ? ` · ${CLIENT_TIER_DESC[client.tier]}` : ''}
              </div>
            </div>
            <button type="button" className="chip" onClick={onClose} aria-label="Bağla">✕</button>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <Metric label="Mərhələ" value={CLIENT_STAGE_LABEL[client.pipeline_stage]} />
            <Metric label={clientValueLabel(client.pipeline_stage)} value={formatAZN(client.expected_value)} />
            <Metric label="Layihə (aktiv/cəmi)" value={`${stat?.active ?? 0}/${stat?.total ?? 0}`} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '8px 16px 0' }} role="tablist">
          {([['projects', 'Layihələr'], ['interactions', 'Əlaqə'], ['history', 'Tarixçə']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className="chip"
              style={tab === k ? { background: 'var(--brand-action)', color: 'var(--brand-text)' } : undefined}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {tab === 'projects' ? (
            <ProjectsTab clientId={client.id} onNavigate={onClose} />
          ) : tab === 'interactions' ? (
            <InteractionsTab clientId={client.id} />
          ) : (
            <HistoryTab clientId={client.id} />
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

function ProjectsTab({ clientId, onNavigate }: { clientId: string; onNavigate: () => void }) {
  const projects = useClientProjects(clientId);
  if (projects.isLoading) return <Muted>Yüklənir…</Muted>;
  if ((projects.data ?? []).length === 0)
    return <Muted>Bu müştəriyə bağlı layihə yoxdur. Layihələr bölməsindən yarat.</Muted>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(projects.data ?? []).map((p) => (
        <Link
          key={p.id}
          to={`/layihelər/${p.id}`}
          onClick={onNavigate}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', textDecoration: 'none', color: 'inherit' }}
        >
          <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PROJECT_STATUS_LABEL[p.status]}</span>
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>›</span>
        </Link>
      ))}
    </div>
  );
}

const INTERACTION_TYPES: InteractionType[] = ['call', 'email', 'meeting', 'whatsapp', 'other'];

function InteractionsTab({ clientId }: { clientId: string }) {
  const interactions = useClientInteractions(clientId);
  const log = useLogInteraction();
  const [type, setType] = useState<InteractionType>('call');
  const [note, setNote] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {INTERACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              style={type === t ? { background: 'var(--brand-action)', color: 'var(--brand-text)' } : undefined}
              onClick={() => setType(t)}
            >
              {INTERACTION_LABEL[t]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Qeyd…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            className="btn-primary"
            disabled={log.isPending}
            onClick={() => log.mutate({ clientId, type, note: note.trim() || undefined }, { onSuccess: () => setNote('') })}
          >
            Əlavə et
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {interactions.isLoading ? (
          <Muted>Yüklənir…</Muted>
        ) : (interactions.data ?? []).length === 0 ? (
          <Muted>Qeyd yoxdur.</Muted>
        ) : (
          (interactions.data ?? []).map((it) => (
            <div key={it.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 64 }}>{INTERACTION_LABEL[it.type]}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-soft)' }}>{it.note ?? '—'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relativeTime(it.occurred_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HistoryTab({ clientId }: { clientId: string }) {
  const history = useClientStageHistory(clientId);
  if (history.isLoading) return <Muted>Yüklənir…</Muted>;
  if ((history.data ?? []).length === 0) return <Muted>Tarixçə yoxdur.</Muted>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(history.data ?? []).map((h) => (
        <div key={h.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
          <span style={{ flex: 1, fontSize: 12 }}>
            {h.from_stage ? `${CLIENT_STAGE_LABEL[h.from_stage]} → ` : ''}
            {CLIENT_STAGE_LABEL[h.to_stage]}
            {h.lost_reason ? ` · ${h.lost_reason}` : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relativeTime(h.changed_at)}</span>
        </div>
      ))}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{children}</div>;
}
