import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import {
  isLostReasonRequired,
  useClientInteractions,
  useClients,
  useClientStageHistory,
  useLogInteraction,
  useUpdateClientStage,
} from '@/lib/hooks';
import {
  CLIENT_STAGE_CONFIDENCE,
  CLIENT_STAGE_LABEL,
  CLIENT_STAGE_ORDER,
  INTERACTION_LABEL,
  LOST_REASONS,
} from '@/lib/labels';
import type { Client, ClientPipelineStage, InteractionType } from '@/types/db';
import { formatAZN, relativeTime } from '@/lib/format';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { ProposalCreateModal } from '@/components/ProposalCreateModal';

type DragPayload = { id: string; from: ClientPipelineStage };
type LostPrompt = { id: string; from: ClientPipelineStage };

export function ClientsPage() {
  const { isAdmin } = useAuth();
  const { data: clients = [], isLoading } = useClients();
  const updateStage = useUpdateClientStage();
  const [active, setActive] = useState<Client | null>(null);
  const [lostPrompt, setLostPrompt] = useState<LostPrompt | null>(null);

  const grouped = useMemo(() => {
    const map: Record<ClientPipelineStage, Client[]> = CLIENT_STAGE_ORDER.reduce(
      (acc, s) => ({ ...acc, [s]: [] }),
      {} as Record<ClientPipelineStage, Client[]>,
    );
    for (const c of clients) map[c.pipeline_stage]?.push(c);
    return map;
  }, [clients]);

  const stageValue = (s: ClientPipelineStage) =>
    grouped[s].reduce(
      (sub, c) => sub + (c.expected_value ?? 0) * (CLIENT_STAGE_CONFIDENCE[s] / 100),
      0,
    );
  const totalPipeline = CLIENT_STAGE_ORDER.reduce((sum, s) => sum + stageValue(s), 0);

  function handleDrop(s: ClientPipelineStage, payload: DragPayload) {
    if (payload.from === s) return;
    if (s === 'lost') {
      setLostPrompt({ id: payload.id, from: payload.from });
      return;
    }
    updateStage.mutate({ id: payload.id, to: s });
  }

  return (
    <>
      <PageHead
        meta={`${clients.length} müştəri · pipeline ${formatAZN(totalPipeline)}`}
        title="Müştərilər"
        actions={
          <>
            <input className="input max-w-[240px]" placeholder="Axtar…" />
            {isAdmin ? <button className="btn-primary">+ Yeni müştəri</button> : null}
          </>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : clients.length === 0 ? (
        <EmptyState
          title="Müştəri yoxdur"
          body="İlk müştərini əlavə et — Lead → Müzakirə → İmzalanıb axını avtomatlaşdırılmışdır."
          cta={isAdmin ? <button className="btn-primary">+ Yeni müştəri</button> : null}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {CLIENT_STAGE_ORDER.map((s) => (
            <div
              key={s}
              className="rounded-card p-3"
              style={{ border: '1px dashed var(--line)', minHeight: 280 }}
              onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
              onDrop={
                isAdmin
                  ? (e) => {
                      const raw = e.dataTransfer.getData('text/plain');
                      if (!raw) return;
                      handleDrop(s, JSON.parse(raw) as DragPayload);
                    }
                  : undefined
              }
            >
              <h3
                className="text-tiny mb-1 tracking-wider"
                style={{
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {CLIENT_STAGE_LABEL[s]} · {grouped[s].length}
              </h3>
              <div className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
                {formatAZN(stageValue(s))}
              </div>
              <div className="space-y-2">
                {grouped[s].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive(c)}
                    draggable={isAdmin}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({ id: c.id, from: c.pipeline_stage } satisfies DragPayload),
                      )
                    }
                    className="card text-left w-full"
                    style={{ padding: 12, cursor: isAdmin ? 'grab' : 'pointer' }}
                  >
                    <div className="font-medium text-body">{c.name}</div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {c.company ?? '—'} · {formatAZN(c.expected_value)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {active ? (
        <ClientPanel client={active} onClose={() => setActive(null)} />
      ) : null}

      {lostPrompt ? (
        <LostReasonModal
          onCancel={() => setLostPrompt(null)}
          onConfirm={(reason) => {
            updateStage.mutate(
              { id: lostPrompt.id, to: 'lost', lostReason: reason },
              {
                onSuccess: () => setLostPrompt(null),
                onError: (e) => {
                  if (isLostReasonRequired(e)) return;
                  setLostPrompt(null);
                },
              },
            );
          }}
        />
      ) : null}
    </>
  );
}

type Tab = 'overview' | 'interactions' | 'history' | 'projects' | 'proposals';

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Ümumi',
  interactions: 'Əlaqələr',
  history: 'Tarixçə',
  projects: 'Layihələr',
  proposals: 'Təkliflər',
};

function ClientPanel({ client, onClose }: { client: Client; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const tabs: Tab[] = ['overview', 'interactions', 'projects', 'proposals', 'history'];
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <aside
        className="w-[520px] h-full bg-surface p-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2">{client.name}</h2>
        <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          {client.company ?? '—'}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t}
              className={`chip ${tab === t ? 'chip-brand' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {tab === 'overview' ? <OverviewTab client={client} /> : null}
        {tab === 'interactions' ? <InteractionsTab clientId={client.id} /> : null}
        {tab === 'history' ? <HistoryTab clientId={client.id} /> : null}
        {tab === 'projects' ? <ClientProjectsTab clientId={client.id} /> : null}
        {tab === 'proposals' ? <ProposalsTab clientId={client.id} /> : null}

        <button className="btn-outline mt-6" onClick={onClose}>
          Bağla
        </button>
      </aside>
    </div>
  );
}

function OverviewTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const { session } = useAuth();

  const refreshIcp = useMutation({
    mutationFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/mirai/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ client_id: client.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ icp_fit: number; cached: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });

  const icpAge = client.ai_icp_calculated_at
    ? Math.floor((Date.now() - new Date(client.ai_icp_calculated_at).getTime()) / 3600000)
    : null;
  const canRefresh = icpAge === null || icpAge >= 24;

  return (
    <div className="space-y-4">
      <dl className="text-body space-y-2">
        <Row label="Mərhələ" value={CLIENT_STAGE_LABEL[client.pipeline_stage]} />
        <Row label="Etibar %" value={`${client.confidence_pct}%`} />
        <Row label="Dəyər" value={formatAZN(client.expected_value)} />
        <Row label="Email" value={client.email ?? '—'} />
        <Row label="Telefon" value={client.phone ?? '—'} />
        <Row label="Son əlaqə" value={relativeTime(client.last_interaction_at)} />
      </dl>

      {/* REQ-CRM-04 — ICP fit display + MIRAI refresh */}
      <div
        className="card"
        style={{ padding: 12, background: 'var(--brand-mist)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            MIRAI ICP uyğunluğu
          </span>
          <button
            className="chip text-meta"
            style={{ cursor: canRefresh ? 'pointer' : 'not-allowed', opacity: canRefresh ? 1 : 0.5 }}
            disabled={!canRefresh || refreshIcp.isPending || !session}
            onClick={() => refreshIcp.mutate()}
            title={!canRefresh ? `Növbəti yeniləmə: ${24 - (icpAge ?? 0)} saat sonra` : 'MIRAI ilə hesabla'}
          >
            {refreshIcp.isPending ? 'Hesablanır…' : 'Yenilə'}
          </button>
        </div>
        <div
          className="text-h2 mt-1"
          style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--brand-text)' }}
        >
          {refreshIcp.data?.icp_fit != null
            ? `${Math.round(refreshIcp.data.icp_fit)}%`
            : client.ai_icp_fit != null
            ? `${Math.round(client.ai_icp_fit)}%`
            : '—'}
        </div>
        {icpAge !== null && (
          <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
            {icpAge < 1 ? 'Az öncə' : `${icpAge}s əvvəl`}
            {refreshIcp.data?.cached ? ' · keşdən' : ''}
          </div>
        )}
        {refreshIcp.error ? (
          <div className="text-meta mt-1" style={{ color: '#B91C1C' }}>
            {(refreshIcp.error as Error).message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClientProjectsTab({ clientId }: { clientId: string }) {
  const projects = useQuery({
    queryKey: ['client-projects', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, deadline, phases')
        .eq('client_id', clientId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (projects.isLoading) return <div className="text-meta">Yüklənir…</div>;
  if (!projects.data?.length)
    return <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Bu müştəriyə aid layihə yoxdur.</div>;

  return (
    <ul className="space-y-2">
      {projects.data.map((p) => (
        <li key={p.id} className="card" style={{ padding: 12 }}>
          <div className="font-medium text-body">{p.name}</div>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {p.status} · {p.deadline ?? 'tarixsiz'} · {(p.phases as string[]).join(', ')}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProposalsTab({ clientId }: { clientId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const proposals = useQuery({
    queryKey: ['client-proposals', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, title, created_at, share_token, external_link')
        .eq('client_id', clientId)
        .eq('category', 'price_protocol')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <button
        className="btn-primary mb-3 text-meta"
        style={{ padding: '4px 12px' }}
        onClick={() => setShowCreate(true)}
      >
        + Təklif
      </button>

      {proposals.isLoading ? (
        <div className="text-meta">Yüklənir…</div>
      ) : !proposals.data?.length ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Qiymət protokolu yoxdur.
        </div>
      ) : (
        <ProposalList docs={proposals.data} />
      )}

      {showCreate && (
        <ProposalCreateModal
          clientId={clientId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function ProposalList({
  docs,
}: {
  docs: Array<{ id: string; title: string; created_at: string; share_token: string | null; external_link: string | null }>;
}) {
  return (
    <ul className="space-y-2">
      {docs.map((doc) => (
        <li key={doc.id} className="card" style={{ padding: 12 }}>
          <div className="font-medium text-body">{doc.title}</div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {new Date(doc.created_at).toLocaleDateString('az-AZ')}
            </span>
            {doc.share_token ? (
              <span className="chip" style={{ fontSize: 11 }}>
                Paylaşıla bilər
              </span>
            ) : null}
            {doc.external_link ? (
              <a
                href={doc.external_link}
                target="_blank"
                rel="noopener noreferrer"
                className="chip"
                style={{ fontSize: 11 }}
              >
                Aç
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function InteractionsTab({ clientId }: { clientId: string }) {
  const { data: items = [], isLoading } = useClientInteractions(clientId);
  const log = useLogInteraction();
  const [type, setType] = useState<InteractionType>('call');
  const [note, setNote] = useState('');

  return (
    <div>
      <div className="card mb-3" style={{ padding: 12 }}>
        <div className="flex flex-wrap gap-1 mb-2">
          {(Object.keys(INTERACTION_LABEL) as InteractionType[]).map((t) => (
            <button
              key={t}
              className={`chip ${type === t ? 'chip-brand' : ''}`}
              onClick={() => setType(t)}
            >
              {INTERACTION_LABEL[t]}
            </button>
          ))}
        </div>
        <input
          className="input w-full mb-2"
          placeholder="Qeyd (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="btn-primary w-full"
          disabled={log.isPending}
          onClick={() =>
            log.mutate(
              { clientId, type, note: note.trim() || undefined },
              { onSuccess: () => setNote('') },
            )
          }
        >
          {log.isPending ? 'Yazılır…' : 'Qeydə al'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-meta">Yüklənir…</div>
      ) : items.length === 0 ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hələ əlaqə qeyd edilməyib.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="card" style={{ padding: 12 }}>
              <div className="flex justify-between text-meta">
                <span>{INTERACTION_LABEL[it.type]}</span>
                <span style={{ color: 'var(--text-muted)' }}>{relativeTime(it.occurred_at)}</span>
              </div>
              {it.note ? <div className="text-body mt-1">{it.note}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({ clientId }: { clientId: string }) {
  const { data: items = [], isLoading } = useClientStageHistory(clientId);
  if (isLoading) return <div className="text-meta">Yüklənir…</div>;
  if (items.length === 0) {
    return (
      <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Mərhələ tarixçəsi yoxdur.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((h) => (
        <li key={h.id} className="card" style={{ padding: 12 }}>
          <div className="text-body">
            {h.from_stage ? CLIENT_STAGE_LABEL[h.from_stage] : '—'} →{' '}
            <strong>{CLIENT_STAGE_LABEL[h.to_stage]}</strong>
          </div>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {relativeTime(h.changed_at)}
          </div>
          {h.lost_reason ? (
            <div className="text-meta mt-1">Səbəb: {h.lost_reason}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function LostReasonModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [picked, setPicked] = useState<string>(LOST_REASONS[0]);
  const [other, setOther] = useState('');
  const isOther = picked === 'Digər';
  const reason = isOther ? other.trim() : picked;
  const valid = reason.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onCancel}
    >
      <div
        className="bg-surface p-6 rounded-card w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-1">Müştəri itirildi</h2>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          Səbəbi qeyd et — pipeline analitikası üçün vacibdir.
        </p>
        <div className="space-y-2 mb-3">
          {LOST_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-body cursor-pointer">
              <input
                type="radio"
                name="lost-reason"
                checked={picked === r}
                onChange={() => setPicked(r)}
              />
              {r}
            </label>
          ))}
        </div>
        {isOther ? (
          <input
            className="input w-full mb-3"
            placeholder="Səbəbi yaz…"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            autoFocus
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onCancel}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!valid}
            onClick={() => valid && onConfirm(reason)}
          >
            Təsdiqlə
          </button>
        </div>
      </div>
    </div>
  );
}
