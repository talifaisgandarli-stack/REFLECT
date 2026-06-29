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
import { formatAZN, formatDate, relativeTime, bakuToday } from '@/lib/format';
import {
  useClientInteractions,
  useClientProjects,
  useClientStageHistory,
  useLogInteraction,
  useReceivablesByClient,
} from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import { MarkPaidModal } from '@/components/MarkPaidModal';
import { CreateReceivableModal } from './CreateReceivableModal';
import { clientColor, initials } from './crmShared';
import type { Project, Receivable } from '@/types/db';

type Tab = 'projects' | 'finance' | 'interactions' | 'history';

const RECEIVABLE_STATUS_LABEL: Record<string, string> = {
  open: 'Açıq', partial: 'Qismən', paid: 'Ödənilib', overdue: 'Gecikmiş',
};

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
  const { isAdmin } = useAuth();
  const clientReceivables = useReceivablesByClient().data?.get(client.id) ?? [];
  const contractTotal = clientReceivables.reduce((s, r) => s + Number(r.amount), 0);
  const hasContract = contractTotal > 0;

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
            <Metric
              label={hasContract ? 'Müqavilə dəyəri' : clientValueLabel(client.pipeline_stage)}
              value={formatAZN(hasContract ? contractTotal : client.expected_value)}
            />
            <Metric label="Layihə (aktiv/cəmi)" value={`${stat?.active ?? 0}/${stat?.total ?? 0}`} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '8px 16px 0' }} role="tablist">
          {(
            [
              ['projects', 'Layihələr'],
              ...(isAdmin ? [['finance', 'Maliyyə'] as const] : []),
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
          ) : tab === 'finance' ? (
            <FinanceTab client={client} />
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

function FinanceTab({ client }: { client: import('@/types/db').Client }) {
  const receivablesQuery = useReceivablesByClient();
  const projectsQuery = useClientProjects(client.id);
  const [paying, setPaying] = useState<Receivable | null>(null);
  const [creating, setCreating] = useState(false);

  const receivables = receivablesQuery.data?.get(client.id) ?? [];
  const projectName = (id: string | null) =>
    id ? (projectsQuery.data ?? []).find((p) => p.id === id)?.name ?? 'Layihə' : 'Ümumi';

  const contract = receivables.reduce((s, r) => s + Number(r.amount), 0);
  const paid = receivables.reduce((s, r) => s + Number(r.paid_amount), 0);
  const remaining = Math.max(0, contract - paid);
  const pct = contract > 0 ? Math.min(100, Math.round((paid / contract) * 100)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary */}
      {contract > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Müqavilə: <b>{formatAZN(contract)}</b></span>
            <span>Ödənilib: <b>{formatAZN(paid)}</b></span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-mist)', overflow: 'hidden' }} aria-hidden>
            <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--success)' }} />
          </div>
          <span style={{ fontSize: 12, color: remaining > 0 ? 'var(--warning)' : 'var(--success-deep)' }}>
            {remaining > 0 ? `Qalıq: ${formatAZN(remaining)}` : 'Tam ödənilib ✓'}
          </span>
        </div>
      ) : null}

      {/* Receivable list */}
      {receivablesQuery.isLoading ? (
        <Muted>Yüklənir…</Muted>
      ) : receivables.length === 0 ? (
        <Muted>Hələ müqavilə yoxdur. Sövdələşmə bağlananda "+ Müqavilə" ilə qeyd et.</Muted>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {receivables.map((r) => {
            const rem = Math.max(0, Number(r.amount) - Number(r.paid_amount));
            // Overdue: compare as Baku calendar dates (due_at is a DATE) — the
            // same timezone-safe rule Finance.tsx uses, so the badge never skews
            // ±1 day in the Baku evening (UTC+4).
            const overdue = r.status !== 'paid' && r.due_at != null && r.due_at < bakuToday();
            return (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{projectName(r.project_id)}</span>
                  <span style={{ fontSize: 11, color: overdue ? 'var(--error)' : 'var(--text-muted)' }}>
                    {overdue ? 'Gecikmiş' : RECEIVABLE_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {rem > 0 ? (
                    <button type="button" className="chip" style={{ height: 24 }} onClick={() => setPaying(r)}>
                      + Ödəniş
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatAZN(Number(r.paid_amount))} / {formatAZN(Number(r.amount))}
                  {rem > 0 ? ` · qalıq ${formatAZN(rem)}` : ''}
                  {r.due_at ? ` · son ${formatDate(r.due_at)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="btn-outline" style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>
        + Müqavilə
      </button>

      {paying ? <MarkPaidModal receivable={paying} onClose={() => setPaying(null)} /> : null}
      {creating ? (
        <CreateReceivableModal
          client={client}
          projects={(projectsQuery.data ?? []) as Project[]}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{children}</div>;
}
