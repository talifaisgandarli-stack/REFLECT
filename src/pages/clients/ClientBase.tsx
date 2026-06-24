/**
 * Surface 2 — Müştəri bazası (PRD Module 6). A searchable/filterable card grid
 * of ALL clients. Aggregates are the client's own deal value (expected_value)
 * and the count of its real architectural projects (client_project_stats) —
 * projects are a separate module, only surfaced here as a read-only count.
 */
import { useMemo, useState } from 'react';
import type { Client } from '@/types/db';
import { CLIENT_STAGE_LABEL, CLIENT_TIER_ORDER, clientTierRank, PROJECT_STATUS_DOT } from '@/lib/labels';
import { formatAZN, relativeTime } from '@/lib/format';
import type { ClientProjectRow } from '@/lib/hooks';
import { StageDot, TierBadge, clientColor, initials } from './crmShared';

type SortKey = 'value' | 'contact' | 'az';

export function ClientBase({
  clients,
  stats,
  projectsByClient,
  onOpenClient,
}: {
  clients: Client[];
  stats: Map<string, { total: number; active: number }>;
  projectsByClient: Map<string, ClientProjectRow[]>;
  onOpenClient: (clientId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [sort, setSort] = useState<SortKey>('value');
  const [groupByTier, setGroupByTier] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = clients.filter((c) => {
      if (c.pipeline_stage === 'archived') return false; // soft-archived/merged
      if (tier !== 'all' && c.tier !== tier) return false;
      if (q) {
        const hay = `${c.name} ${c.company ?? ''} ${c.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'value') return (b.expected_value ?? 0) - (a.expected_value ?? 0);
      if (sort === 'az') return (a.company ?? a.name).localeCompare(b.company ?? b.name, 'az');
      const at = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      const bt = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : 0;
      return bt - at;
    });
    return rows;
  }, [clients, search, tier, sort]);

  const groups = useMemo(() => {
    if (!groupByTier) return [{ key: 'all', label: '', rows: filtered }];
    const order = [...CLIENT_TIER_ORDER, null];
    return order
      .map((t) => ({
        key: t ?? 'none',
        label: t ? `Tier ${t}` : 'Tier təyin edilməyib',
        rows: filtered.filter((c) => c.tier === t).sort((a, b) => clientTierRank(a.tier) - clientTierRank(b.tier)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, groupByTier]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="input max-w-[240px]"
          placeholder="Axtar (ad, təşkilat, email)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" style={{ width: 'auto' }} value={tier} onChange={(e) => setTier(e.target.value as typeof tier)} aria-label="Tier filtri">
          <option value="all">Bütün Tier</option>
          {CLIENT_TIER_ORDER.map((t) => (
            <option key={t} value={t}>Tier {t}</option>
          ))}
        </select>
        <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sıralama">
          <option value="value">Dəyər ↓</option>
          <option value="contact">Son əlaqə</option>
          <option value="az">A→Z</option>
        </select>
        <label className="chip" style={{ cursor: 'pointer', gap: 6, display: 'inline-flex', alignItems: 'center' }}>
          <input type="checkbox" checked={groupByTier} onChange={(e) => setGroupByTier(e.target.checked)} />
          Tier-ə görə qrupla
        </label>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: g.label ? 16 : 0 }}>
          {g.label ? (
            <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
              {g.label} · {g.rows.length}
            </h3>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {g.rows.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                stat={stats.get(c.id)}
                projects={projectsByClient.get(c.id) ?? []}
                onOpen={() => onOpenClient(c.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientCard({
  client,
  stat,
  projects,
  onOpen,
}: {
  client: Client;
  stat?: { total: number; active: number };
  projects: ClientProjectRow[];
  onOpen: () => void;
}) {
  const total = stat?.total ?? projects.length;
  const active = stat?.active ?? projects.filter((p) => p.status === 'active').length;
  const portfolioOnly = client.pipeline_stage === 'portfolio';
  const noData = !client.expected_value && total === 0;
  const shown = projects.slice(0, 2);
  const rest = projects.length - shown.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card"
      style={{ padding: 12, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, opacity: portfolioOnly ? 0.82 : 1, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span
          aria-hidden
          style={{ width: 32, height: 32, borderRadius: '50%', background: clientColor(client.id), color: '#fff', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          {initials(client.company || client.name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {client.company || client.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {client.company ? client.name : 'Sifarişçi'}
          </div>
        </div>
        <TierBadge tier={client.tier} />
      </div>

      {noData ? (
        <div style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', borderRadius: 8, padding: '6px 8px' }}>
          ⚠ data əksikdir
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Mini label="Gözlənilən dəyər" value={formatAZN(client.expected_value)} />
            <Mini label="Layihə (aktiv/cəmi)" value={`${active}/${total}`} />
          </div>
          {/* Mini project list — names + status dot, first 2 then "+N" overflow */}
          {projects.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {shown.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: PROJECT_STATUS_DOT[p.status], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                </div>
              ))}
              {rest > 0 ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{rest} layihə</span>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StageDot stage={client.pipeline_stage} />
        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
          {CLIENT_STAGE_LABEL[client.pipeline_stage]}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          Son əlaqə: {relativeTime(client.last_interaction_at)}
        </span>
      </div>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-mist)', borderRadius: 8, padding: '6px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
