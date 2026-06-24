/**
 * Surface 2 — Client base (CRM redesign §5). A searchable/filterable card grid
 * of ALL clients (never split into stage columns, so it never "gets messy").
 * Every number is aggregated from the `client_summary` view; the mini project
 * list reuses the already-loaded pipeline projects.
 */
import { useMemo, useState } from 'react';
import type { ClientSummary, ProjectStage, ServiceType } from '@/types/db';
import { CLIENT_TIER_ORDER, SERVICE_TYPE_LABEL, PROJECT_STAGE_LABEL } from '@/lib/labels';
import { formatAZN, relativeTime } from '@/lib/format';
import type { ProjectWithClient } from '@/lib/hooks';
import { StageDot, TierBadge, clientColor, initials } from './crmShared';

type SortKey = 'value' | 'contact' | 'az';

export function ClientBase({
  clients,
  projects,
  onOpenClient,
}: {
  clients: ClientSummary[];
  projects: ProjectWithClient[];
  onOpenClient: (clientId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [service, setService] = useState<'all' | ServiceType>('all');
  const [sort, setSort] = useState<SortKey>('value');
  const [groupByTier, setGroupByTier] = useState(false);

  const projectsByClient = useMemo(() => {
    const m = new Map<string, ProjectWithClient[]>();
    for (const p of projects) {
      if (!p.client_id) continue;
      const list = m.get(p.client_id) ?? [];
      list.push(p);
      m.set(p.client_id, list);
    }
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = clients.filter((c) => {
      if (tier !== 'all' && c.tier !== tier) return false;
      if (q) {
        const hay = `${c.name} ${c.company ?? ''} ${c.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (service !== 'all') {
        const ps = projectsByClient.get(c.id) ?? [];
        if (!ps.some((p) => p.service_type === service)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'value') return (b.total_value ?? 0) - (a.total_value ?? 0);
      if (sort === 'az') return a.name.localeCompare(b.name, 'az');
      // contact: most-recent first; nulls last
      const at = a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0;
      const bt = b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0;
      return bt - at;
    });
    return rows;
  }, [clients, search, tier, service, sort, projectsByClient]);

  const groups = useMemo(() => {
    if (!groupByTier) return [{ key: 'all', label: '', rows: filtered }];
    const order = [...CLIENT_TIER_ORDER, null];
    return order
      .map((t) => ({
        key: t ?? 'none',
        label: t ? `Tier ${t}` : 'Tier təyin edilməyib',
        rows: filtered.filter((c) => c.tier === t),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, groupByTier]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="input max-w-[240px]"
          placeholder="Axtar (ad, təşkilat, email)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          style={{ width: 'auto' }}
          value={tier}
          onChange={(e) => setTier(e.target.value as typeof tier)}
          aria-label="Tier filtri"
        >
          <option value="all">Bütün Tier</option>
          {CLIENT_TIER_ORDER.map((t) => (
            <option key={t} value={t}>
              Tier {t}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ width: 'auto' }}
          value={service}
          onChange={(e) => setService(e.target.value as typeof service)}
          aria-label="Xidmət filtri"
        >
          <option value="all">Bütün xidmət</option>
          {(Object.keys(SERVICE_TYPE_LABEL) as ServiceType[]).map((s) => (
            <option key={s} value={s}>
              {SERVICE_TYPE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ width: 'auto' }}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sıralama"
        >
          <option value="value">Dəyər ↓</option>
          <option value="contact">Son əlaqə</option>
          <option value="az">A→Z</option>
        </select>
        <label
          className="chip"
          style={{ cursor: 'pointer', gap: 6, display: 'inline-flex', alignItems: 'center' }}
        >
          <input
            type="checkbox"
            checked={groupByTier}
            onChange={(e) => setGroupByTier(e.target.checked)}
          />
          Tier-ə görə qrupla
        </label>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: g.label ? 16 : 0 }}>
          {g.label ? (
            <h3
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                margin: '4px 0 8px',
              }}
            >
              {g.label} · {g.rows.length}
            </h3>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {g.rows.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
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
  projects,
  onOpen,
}: {
  client: ClientSummary;
  projects: ProjectWithClient[];
  onOpen: () => void;
}) {
  const empty = client.total_projects === 0;
  const portfolioOnly = !empty && !client.has_active_work;
  const shown = projects.slice(0, 3);
  const rest = projects.length - shown.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card"
      style={{
        padding: 12,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: portfolioOnly ? 0.82 : 1,
        cursor: 'pointer',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: clientColor(client.id),
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {initials(client.name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {client.name}
          </div>
          {client.company ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {client.company}
            </div>
          ) : null}
        </div>
        <TierBadge tier={client.tier} />
      </div>

      {empty ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--warning)',
            background: 'var(--warning-bg)',
            borderRadius: 8,
            padding: '6px 8px',
          }}
        >
          ⚠ data əksikdir — + İlk layihəni əlavə et
        </div>
      ) : (
        <>
          {/* Two metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Mini label="Ümumi dəyər" value={formatAZN(client.total_value)} />
            <Mini
              label="Aktiv / cəmi"
              value={`${client.active_projects}/${client.total_projects}`}
            />
          </div>

          {/* Mini project list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {shown.map((p) => (
              <div
                key={p.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
              >
                <StageDot stage={p.stage} />
                <span
                  style={{
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {p.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {PROJECT_STAGE_LABEL[p.stage as ProjectStage]}
                </span>
              </div>
            ))}
            {rest > 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{rest} layihə</span>
            ) : null}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {portfolioOnly ? 'Portfolio · ' : ''}
        Son əlaqə: {relativeTime(client.last_contact_at)}
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
