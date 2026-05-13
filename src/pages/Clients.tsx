import { useEffect, useMemo, useState } from 'react';
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
import { SkeletonList } from '@/components/Skeleton';
import type { Client, ClientPipelineStage, InteractionType } from '@/types/db';
import { formatAZN, relativeTime } from '@/lib/format';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type DragPayload = { id: string; from: ClientPipelineStage };
type LostPrompt = { id: string; from: ClientPipelineStage };
type ClientPanelTab = 'overview' | 'interactions' | 'proposals' | 'projects' | 'documents' | 'history';

export function ClientsPage() {
  const { isAdmin, role } = useAuth();
  const { data: clients = [], isLoading } = useClients();
  const updateStage = useUpdateClientStage();
  const [active, setActive] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [lostPrompt, setLostPrompt] = useState<LostPrompt | null>(null);
  const [search, setSearch] = useState('');

  // BD Lead may also drag (PRD §8 RLS allows insert/update). Admin retains
  // full control; non-admin/non-BD-Lead is read-only.
  const canDrag = isAdmin || role?.key === 'bd_lead';

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    );
  }, [clients, search]);

  const grouped = useMemo(() => {
    const map: Record<ClientPipelineStage, Client[]> = CLIENT_STAGE_ORDER.reduce(
      (acc, s) => ({ ...acc, [s]: [] }),
      {} as Record<ClientPipelineStage, Client[]>,
    );
    for (const c of filteredClients) map[c.pipeline_stage]?.push(c);
    return map;
  }, [filteredClients]);

  // REQ-CRM-02 — pipeline value uses each client's own confidence_pct, not the
  // stage default (which the kanban already implies).
  const stageValue = (s: ClientPipelineStage) =>
    grouped[s].reduce(
      (sub, c) => sub + (c.expected_value ?? 0) * ((c.confidence_pct ?? CLIENT_STAGE_CONFIDENCE[s]) / 100),
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
            <input
              className="input max-w-[240px]"
              placeholder="Axtar (ad, şirkət, email)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {canDrag ? <button className="btn-primary" onClick={() => setCreating(true)}>+ Yeni müştəri</button> : null}
          </>
        }
      />

      {isLoading ? (
        <SkeletonList rows={6} />
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
              onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
              onDrop={
                canDrag
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

      {creating ? (
        <CreateClientModal
          onClose={() => setCreating(false)}
          onCreated={() => setCreating(false)}
        />
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

// ── Create client modal (REQ-CRM-01) ──
function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [expectedValue, setExpectedValue] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      const { error } = await supabase.from('clients').insert({
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        expected_value: expectedValue ? Number(expectedValue) : null,
        pipeline_stage: 'lead',
        confidence_pct: 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      onCreated();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      >
        <h2 className="text-h2 mb-4">Yeni müştəri</h2>
        <div className="space-y-3">
          <CField label="Ad *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </CField>
          <CField label="Şirkət">
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </CField>
          <div className="grid grid-cols-2 gap-3">
            <CField label="Email">
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </CField>
            <CField label="Telefon">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </CField>
          </div>
          <CField label="Gözlənilən dəyər (AZN)">
            <input
              type="number"
              min="0"
              step="100"
              className="input"
              value={expectedValue}
              onChange={(e) => setExpectedValue(e.target.value)}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </CField>
        </div>
        {create.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>{(create.error as Error).message}</p>
        ) : null}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>Ləğv</button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

// ClientPanelTab defined above

const PANEL_TABS: { key: ClientPanelTab; label: string }[] = [
  { key: 'overview', label: 'Ümumi' },
  { key: 'interactions', label: 'Əlaqələr' },
  { key: 'proposals', label: 'Təkliflər' },
  { key: 'projects', label: 'Layihələr' },
  { key: 'documents', label: 'Sənədlər' },
  { key: 'history', label: 'Tarixçə' },
];

function ClientPanel({ client, onClose }: { client: Client; onClose: () => void }) {
  const [tab, setTab] = useState<ClientPanelTab>('overview');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-h2">{client.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-meta"
            style={{ color: 'var(--text-muted)', fontSize: 20 }}
            aria-label="Bağla"
          >
            ✕
          </button>
        </div>
        <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          {client.company ?? '—'}
        </div>

        <div className="flex gap-1 mb-5 flex-wrap">
          {PANEL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="chip"
              style={{
                background: tab === t.key ? 'var(--brand-action)' : 'var(--surface)',
                color: tab === t.key ? 'var(--ink)' : 'var(--text)',
                fontWeight: tab === t.key ? 600 : 400,
                padding: '4px 10px',
                fontSize: 13,
              }}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' ? <OverviewTab client={client} /> : null}
        {tab === 'interactions' ? <InteractionsTab clientId={client.id} /> : null}
        {tab === 'proposals' ? <ProposalsTab clientId={client.id} /> : null}
        {tab === 'projects' ? <ProjectsTab clientId={client.id} /> : null}
        {tab === 'documents' ? <DocumentsTab clientId={client.id} /> : null}
        {tab === 'history' ? <HistoryTab clientId={client.id} /> : null}
      </aside>
    </div>
  );
}

// REQ-CRM-05 / US-CRM-05 — Proposals tab: list + create price_protocol documents
function ProposalsTab({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['client_proposals', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, title, share_token, created_at, external_link')
        .eq('client_id', clientId)
        .eq('category', 'price_protocol')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/docs/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {proposals.length} təklif
        </span>
        <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setCreating(true)}>
          + Təklif yarat
        </button>
      </div>

      {isLoading ? <div className="text-meta">Yüklənir…</div> : null}

      {!isLoading && proposals.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hələ qiymət protokolu yoxdur.
        </p>
      ) : null}

      <ul className="space-y-2">
        {proposals.map((p: { id: string; title: string; share_token: string | null; created_at: string; external_link: string | null }) => (
          <li key={p.id} className="card" style={{ padding: 12 }}>
            <div className="text-body font-medium">{p.title}</div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {p.share_token ? (
                <button
                  type="button"
                  className="text-meta"
                  style={{ color: copied === p.share_token ? 'var(--brand-action)' : 'var(--brand-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => copyLink(p.share_token!)}
                >
                  {copied === p.share_token ? '✓ Kopyalandı' : 'Linki paylaş'}
                </button>
              ) : null}
              {p.external_link ? (
                <a
                  href={p.external_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Drive ↗
                </a>
              ) : null}
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {new Date(p.created_at).toLocaleDateString('az-AZ')}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {creating ? (
        <CreateProposalModal
          clientId={clientId}
          authorId={profile?.id ?? null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['client_proposals', clientId] });
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

// US-CRM-05 — create proposal modal
function CreateProposalModal({
  clientId,
  authorId,
  onClose,
  onSaved,
}: {
  clientId: string;
  authorId: string | null;
  onClose: () => void;
  onSaved: (token: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const token = crypto.randomUUID();
      const { error } = await supabase.from('project_documents').insert({
        client_id: clientId,
        project_id: null,
        category: 'price_protocol',
        title: title.trim(),
        source: 'auto_generated',
        share_token: token,
        external_link: externalLink.trim() || null,
        storage_path: null,
        shared_with: [],
        created_by: authorId,
      });
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      setShareToken(token);
    },
  });

  const shareUrl = shareToken ? `${window.location.origin}/docs/${shareToken}` : '';

  function copyAndClose() {
    if (shareToken) navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => { onSaved(shareToken!); }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.6)' }}
      onClick={shareToken ? undefined : onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        {!shareToken ? (
          <>
            <h2 className="text-h2 mb-4">Təklif yarat</h2>

            <label className="block mb-3">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Başlıq *</span>
              <input
                className="input w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Qiymət protokolu — İyun 2026"
                autoFocus
              />
            </label>

            <label className="block mb-5">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Drive / xarici link (ixtiyari)
              </span>
              <input
                className="input w-full"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://docs.google.com/…"
              />
            </label>

            {save.error ? (
              <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>
                {(save.error as Error).message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={onClose}>Ləğv et</button>
              <button
                className="btn-primary"
                disabled={save.isPending || !title.trim()}
                onClick={() => save.mutate()}
              >
                {save.isPending ? 'Yaradılır…' : 'Yarat'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-h2 mb-2">Təklif yaradıldı</h2>
            <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              Bu linki müştəriyə göndərin. Giriş tələb olunmur.
            </p>
            <div
              className="rounded-card p-3 mb-4 flex items-center gap-2"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}
            >
              <span className="flex-1 text-meta truncate" style={{ color: 'var(--text-muted)' }}>
                {shareUrl}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={onClose}>Bağla</button>
              <button className="btn-primary" onClick={copyAndClose}>
                {copied ? '✓ Kopyalandı' : 'Linki paylaş'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// REQ-CRM-05 — Projects tab: projects linked to this client
function ProjectsTab({ clientId }: { clientId: string }) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['client_projects', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, deadline')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="text-meta">Yüklənir…</div>;
  if (projects.length === 0) {
    return (
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Bu müştəriyə bağlı layihə yoxdur.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {projects.map((p: { id: string; name: string; status: string; deadline: string | null }) => (
        <li key={p.id} className="card" style={{ padding: 12 }}>
          <div className="text-body font-medium">{p.name}</div>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {p.status} {p.deadline ? `· ${new Date(p.deadline).toLocaleDateString('az-AZ')}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}

// REQ-CRM-05 — Documents tab: project_documents (non-proposal) for this client
function DocumentsTab({ clientId }: { clientId: string }) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['client_docs', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, title, category, created_at, external_link, source')
        .eq('client_id', clientId)
        .neq('category', 'price_protocol')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="text-meta">Yüklənir…</div>;
  if (docs.length === 0) {
    return (
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Sənəd yoxdur.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {docs.map((d: { id: string; title: string; category: string | null; created_at: string; external_link: string | null }) => (
        <li key={d.id} className="card" style={{ padding: 12 }}>
          <div className="text-body font-medium">{d.title}</div>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {d.category ?? '—'} · {new Date(d.created_at).toLocaleDateString('az-AZ')}
          </div>
          {d.external_link ? (
            <a
              href={d.external_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-meta"
              style={{ color: 'var(--brand-text)' }}
            >
              Aç →
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function OverviewTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const [icpLoading, setIcpLoading] = useState(false);
  const [icpErr, setIcpErr] = useState<string | null>(null);

  // REQ-CRM-04 — throttle: max 1 refresh per 24h per client
  const lastRun = client.ai_icp_calculated_at ? new Date(client.ai_icp_calculated_at) : null;
  const hoursSince = lastRun ? (Date.now() - lastRun.getTime()) / 3_600_000 : Infinity;
  const throttled = hoursSince < 24;

  async function runIcp() {
    if (throttled) return;
    setIcpLoading(true);
    setIcpErr(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya yoxdur');
      const res = await fetch('/api/crm/icp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ client_id: client.id }),
      });
      const data = await res.json().catch(() => ({})) as { score?: number; throttled?: boolean; error?: string };
      if (res.status === 429 || data.throttled) {
        setIcpErr('Son 24 saat ərzində artıq analiz edilib.');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'AI analiz uğursuz oldu');
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (e) {
      setIcpErr((e as Error).message);
    } finally {
      setIcpLoading(false);
    }
  }

  return (
    <div>
      <dl className="text-body space-y-2">
        <Row label="Mərhələ" value={CLIENT_STAGE_LABEL[client.pipeline_stage]} />
        <Row label="Etibar %" value={`${client.confidence_pct}%`} />
        <Row label="Dəyər" value={formatAZN(client.expected_value)} />
        <Row label="Email" value={client.email ?? '—'} />
        <Row label="Telefon" value={client.phone ?? '—'} />
        <Row label="Son əlaqə" value={relativeTime(client.last_interaction_at)} />
        <Row
          label="ICP uyğunluğu"
          value={client.ai_icp_fit != null ? `${Math.round(client.ai_icp_fit)}%` : '—'}
        />
      </dl>
      <div className="mt-4">
        <button
          className="btn-outline"
          disabled={icpLoading || throttled}
          onClick={runIcp}
          title={throttled ? `Son yenilənmə: ${lastRun?.toLocaleString('az-AZ')} (24 saatda 1 dəfə)` : undefined}
        >
          {icpLoading ? 'AI analiz edir…' : throttled ? `AI analiz — ${Math.ceil(24 - hoursSince)}s sonra` : 'AI analiz (ICP)'}
        </button>
        {icpErr ? <p className="text-meta mt-1" style={{ color: '#B91C1C' }}>{icpErr}</p> : null}
      </div>
    </div>
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
