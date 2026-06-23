// Account table view for Müştərilər (extracted from Clients.tsx, Phase 4).
// Pure presentation/data — no behaviour change. Owns the tier badge/editor, the
// KPI strip, the sortable + groupable accounts table and the projects popover.
import { Fragment, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  CLIENT_STAGE_LABEL,
  CLIENT_STAGE_ORDER,
  CLIENT_TIER_LABEL,
  CLIENT_TIER_ORDER,
  CLIENT_TIER_RANK,
  CLIENT_TIER_STYLE,
  PROJECT_STATUS_LABEL,
} from '@/lib/labels';
import type { Client, ClientTier, ProjectStatus } from '@/types/db';
import { formatAZN, relativeTime } from '@/lib/format';

export type GroupBy = 'none' | 'tier' | 'stage' | 'industry';
type TableSort = 'name' | 'tier' | 'stage' | 'projects' | 'value' | 'last_interaction' | 'icp';
type Stats = Map<string, { total: number; active: number }> | undefined;

// ── Tier badge + editor (account segmentation) ──
export function TierBadge({ tier, muted }: { tier: ClientTier; muted?: boolean }) {
  if (tier === 'none') {
    return <span className="text-meta" style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  const st = CLIENT_TIER_STYLE[tier];
  return (
    <span
      className="chip inline-flex items-center gap-1"
      style={{ background: muted ? 'transparent' : st.bg, color: st.color, fontSize: 11, fontWeight: 600, padding: '0 8px' }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: st.color, display: 'inline-block' }} />
      {CLIENT_TIER_LABEL[tier]}
    </span>
  );
}

// Admin-only inline tier change (product decision 2026-06). Non-admins see the
// badge read-only.
export function TierControl({ client, editable }: { client: Client; editable: boolean }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (next: ClientTier) => {
      const { error } = await supabase.from('clients').update({ tier: next }).eq('id', client.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  if (!editable) return <TierBadge tier={client.tier} />;
  return (
    <select
      className="input"
      style={{ height: 26, fontSize: 11, padding: '0 6px', maxWidth: 130, color: CLIENT_TIER_STYLE[client.tier].color, fontWeight: client.tier === 'none' ? 400 : 600 }}
      value={client.tier}
      disabled={update.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => update.mutate(e.target.value as ClientTier)}
      aria-label="Müştəri tier"
    >
      {CLIENT_TIER_ORDER.map((t) => (
        <option key={t} value={t}>{CLIENT_TIER_LABEL[t]}</option>
      ))}
    </select>
  );
}

// Compact KPI strip — replaces the empty funnel + value chart with one row of
// the numbers that actually matter for account management.
export function ClientsKpiStrip({
  clients, stats, isAdmin, totalPipeline,
}: {
  clients: Client[];
  stats: Stats;
  isAdmin: boolean;
  totalPipeline: number;
}) {
  const activeAccounts = clients.filter((c) => (stats?.get(c.id)?.active ?? 0) > 0).length;
  const vip = clients.filter((c) => c.tier === 'vip').length;
  const gold = clients.filter((c) => c.tier === 'gold').length;
  let top: { name: string; total: number } | null = null;
  for (const c of clients) {
    const t = stats?.get(c.id)?.total ?? 0;
    if (t > 0 && (!top || t > top.total)) top = { name: c.name, total: t };
  }
  const Stat = ({ big, label }: { big: string; label: string }) => (
    <span className="flex items-baseline gap-1">
      <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{big}</strong>
      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </span>
  );
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ padding: '12px 16px' }}>
      <Stat big={String(clients.length)} label="müştəri" />
      <Stat big={String(activeAccounts)} label="aktiv layihəli" />
      {vip > 0 ? <span className="flex items-center gap-1"><TierBadge tier="vip" /><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{vip}</strong></span> : null}
      {gold > 0 ? <span className="flex items-center gap-1"><TierBadge tier="gold" /><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{gold}</strong></span> : null}
      {isAdmin && totalPipeline > 0 ? <Stat big={formatAZN(totalPipeline)} label="pipeline" /> : null}
      {top ? (
        <span className="text-meta ml-auto" style={{ color: 'var(--text-muted)' }}>
          Ən çox layihə: <strong style={{ color: 'var(--text)' }}>{top.name}</strong> ({top.total})
        </span>
      ) : null}
    </div>
  );
}

// Projects cell — count + click-through popover listing the client's projects.
// The project list is fetched lazily, only when the popover opens (no N+1).
function ProjectsCell({ client, total, active }: { client: Client; total: number; active: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const q = useQuery({
    queryKey: ['client-projects-pop', client.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, status')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as Array<{ id: string; name: string; status: ProjectStatus }>;
    },
  });
  if (total === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
        title="Layihələri göstər"
      >
        <strong style={{ color: 'var(--success-deep, #16794a)' }}>{active} aktiv</strong>
        <span style={{ color: 'var(--text-muted)' }}> / {total}</span>
      </button>
      {open ? (
        <div
          className="card"
          style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, marginTop: 4, minWidth: 260, padding: 8, boxShadow: '0 8px 24px rgba(14,22,17,0.18)' }}
        >
          {q.isLoading ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Layihə yoxdur</div>
          ) : (
            <ul className="space-y-1">
              {(q.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-meta">
                  <a href={`/layihelər/${p.id}`} className="hover:underline truncate" style={{ color: 'var(--brand-text)' }}>{p.name}</a>
                  <span style={{ color: p.status === 'active' ? 'var(--success-deep, #16794a)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ClientRow({ c, isAdmin, onOpen, total, active }: {
  c: Client; isAdmin: boolean; onOpen: (c: Client) => void; total: number; active: number;
}) {
  return (
    <tr
      className="hover:bg-surface-mist transition-colors cursor-pointer"
      style={{ borderBottom: '1px solid var(--line-soft)' }}
      onClick={() => onOpen(c)}
    >
      <td className="py-3 px-3">
        <div className="font-medium">{c.name}</div>
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{c.company ?? '—'}{c.industry ? ` · ${c.industry}` : ''}</div>
      </td>
      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
        <TierControl client={c} editable={isAdmin} />
      </td>
      <td className="py-3 px-3">
        <span className="chip" style={{ background: 'var(--surface-mist)', color: 'var(--text)', fontSize: 12 }}>
          {CLIENT_STAGE_LABEL[c.pipeline_stage]}
        </span>
      </td>
      <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <ProjectsCell client={c} total={total} active={active} />
      </td>
      {isAdmin ? (
        <td className="py-3 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {(c.expected_value ?? 0) > 0 ? formatAZN(c.expected_value) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </td>
      ) : null}
      <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>{relativeTime(c.last_interaction_at)}</td>
      <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {c.ai_icp_fit != null ? `${Math.round(c.ai_icp_fit)}%` : '—'}
      </td>
    </tr>
  );
}

export function ClientsTable({
  clients,
  stats,
  isAdmin,
  onOpen,
  groupBy,
}: {
  clients: Client[];
  stats: Stats;
  isAdmin: boolean;
  onOpen: (c: Client) => void;
  groupBy: GroupBy;
}) {
  const [sort, setSort] = useState<TableSort>('projects');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: TableSort) {
    if (sort === key) { setDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSort(key);
    setDir(key === 'name' ? 'asc' : 'desc');
  }

  const totalOf = (c: Client) => stats?.get(c.id)?.total ?? 0;
  const activeOf = (c: Client) => stats?.get(c.id)?.active ?? 0;

  const sorted = [...clients].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case 'name': cmp = a.name.localeCompare(b.name, 'az'); break;
      case 'tier': cmp = CLIENT_TIER_RANK[a.tier] - CLIENT_TIER_RANK[b.tier]; break;
      case 'stage': cmp = CLIENT_STAGE_ORDER.indexOf(a.pipeline_stage) - CLIENT_STAGE_ORDER.indexOf(b.pipeline_stage); break;
      case 'projects': cmp = totalOf(a) - totalOf(b) || activeOf(a) - activeOf(b); break;
      case 'value': cmp = (a.expected_value ?? 0) - (b.expected_value ?? 0); break;
      case 'last_interaction': cmp = (a.last_interaction_at ?? '').localeCompare(b.last_interaction_at ?? ''); break;
      case 'icp': cmp = (a.ai_icp_fit ?? -1) - (b.ai_icp_fit ?? -1); break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });

  // Ordered groups for the chosen grouping (empty groups dropped).
  const groups: { key: string; label: string; badge?: ClientTier; rows: Client[] }[] = (() => {
    if (groupBy === 'tier') {
      return CLIENT_TIER_ORDER
        .map((t) => ({ key: t, label: CLIENT_TIER_LABEL[t], badge: t, rows: sorted.filter((c) => c.tier === t) }))
        .filter((g) => g.rows.length > 0);
    }
    if (groupBy === 'stage') {
      return CLIENT_STAGE_ORDER
        .map((s) => ({ key: s, label: CLIENT_STAGE_LABEL[s], rows: sorted.filter((c) => c.pipeline_stage === s) }))
        .filter((g) => g.rows.length > 0);
    }
    if (groupBy === 'industry') {
      const inds = Array.from(new Set(sorted.map((c) => c.industry ?? ''))).sort();
      return inds
        .map((ind) => ({ key: ind || '__none', label: ind || 'Sahə təyin edilməyib', rows: sorted.filter((c) => (c.industry ?? '') === ind) }))
        .filter((g) => g.rows.length > 0);
    }
    return [{ key: 'all', label: '', rows: sorted }];
  })();

  const cols: { key: TableSort; label: string; admin?: boolean; align?: 'right' }[] = [
    { key: 'name', label: 'Müştəri' },
    { key: 'tier', label: 'Tier' },
    { key: 'stage', label: 'Mərhələ' },
    { key: 'projects', label: 'Layihələr (aktiv/cəmi)' },
    { key: 'value', label: 'Dəyər', admin: true, align: 'right' },
    { key: 'last_interaction', label: 'Son əlaqə' },
    { key: 'icp', label: 'ICP' },
  ];
  const visibleCols = cols.filter((c) => !c.admin || isAdmin);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {visibleCols.map((c) => (
              <th
                key={c.key}
                className="py-3 px-3 text-meta select-none"
                style={{
                  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  textAlign: c.align === 'right' ? 'right' : 'left', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onClick={() => toggleSort(c.key)}
                title={`${c.label} — sırala`}
              >
                {c.label}{sort === c.key ? <span style={{ color: 'var(--brand-text)' }}> {dir === 'asc' ? '↑' : '↓'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {groupBy !== 'none' ? (
                <tr style={{ background: 'var(--surface-mist)' }}>
                  <td colSpan={visibleCols.length} className="py-2 px-3 text-meta" style={{ color: 'var(--text-soft)', fontWeight: 600 }}>
                    <span className="inline-flex items-center gap-2">
                      {g.badge && g.badge !== 'none' ? <TierBadge tier={g.badge} /> : null}
                      {g.label} · {g.rows.length}
                    </span>
                  </td>
                </tr>
              ) : null}
              {g.rows.map((c) => (
                <ClientRow key={c.id} c={c} isAdmin={isAdmin} onOpen={onOpen} total={totalOf(c)} active={activeOf(c)} />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
