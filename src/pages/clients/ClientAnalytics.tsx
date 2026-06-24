/**
 * Surface 3 — Analitika (CRM). Answers "what's our current load and who drives
 * it?": active-client / active-project totals, plus a per-client ranking of
 * project counts. All computed client-side from the already-loaded clients +
 * projects — no extra query.
 */
import { useMemo } from 'react';
import type { Client } from '@/types/db';
import type { ClientProjectRow } from '@/lib/hooks';
import { formatAZN } from '@/lib/format';

export function ClientAnalytics({
  clients,
  projectsByClient,
}: {
  clients: Client[];
  projectsByClient: Map<string, ClientProjectRow[]>;
}) {
  const rows = useMemo(() => {
    return clients
      .filter((c) => c.pipeline_stage !== 'archived')
      .map((c) => {
        const ps = projectsByClient.get(c.id) ?? [];
        const active = ps.filter((p) => p.status === 'active').length;
        return {
          id: c.id,
          label: c.company || c.name,
          sub: c.company ? c.name : null,
          total: ps.length,
          active,
          value: c.expected_value ?? 0,
        };
      })
      .sort((a, b) => b.active - a.active || b.total - a.total);
  }, [clients, projectsByClient]);

  const totals = useMemo(() => {
    const activeClients = rows.filter((r) => r.active > 0).length;
    const totalProjects = rows.reduce((s, r) => s + r.total, 0);
    const activeProjects = rows.reduce((s, r) => s + r.active, 0);
    const expected = rows.reduce((s, r) => s + r.value, 0);
    return { clients: rows.length, activeClients, totalProjects, activeProjects, expected };
  }, [rows]);

  const maxActive = Math.max(1, ...rows.map((r) => r.active));

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <Kpi label="Cəmi müştəri" value={String(totals.clients)} />
        <Kpi label="Aktiv müştəri" value={String(totals.activeClients)} accent />
        <Kpi label="Cəmi layihə" value={String(totals.totalProjects)} />
        <Kpi label="Aktiv layihə" value={String(totals.activeProjects)} accent />
        <Kpi label="Gözlənilən dəyər" value={formatAZN(totals.expected)} />
      </div>

      {/* Per-client ranking */}
      <h3 style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>Müştəri üzrə layihə</h3>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Məlumat yoxdur.</p>
      ) : (
        <div className="card" style={{ padding: 8 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid var(--line-soft)' }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}
                </div>
                {r.sub ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.sub}</div> : null}
              </div>
              {/* mini bar — active projects relative to the busiest client */}
              <div style={{ width: 120, height: 6, borderRadius: 3, background: 'var(--surface-mist)', overflow: 'hidden' }} aria-hidden>
                <span style={{ display: 'block', height: '100%', width: `${(r.active / maxActive) * 100}%`, background: 'var(--success)' }} />
              </div>
              <div style={{ width: 86, textAlign: 'right', fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.active}</span>
                <span style={{ color: 'var(--text-muted)' }}> aktiv / {r.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 500, color: accent ? 'var(--brand-text)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}
