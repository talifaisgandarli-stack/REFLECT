/**
 * Audit log viewer (PRD §9.4) — admin only.
 * Reads audit_log + activity_log together so the page covers both
 * privileged actions (audit_log: role/policy changes via api/*) and
 * data-touch history (activity_log: trigger-emitted CRUD events).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { formatDate, relativeTime } from '@/lib/format';
import { activityHref } from '@/lib/activity';

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  action: string;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export function AuditLogPage() {
  const [tab, setTab] = useState<'audit' | 'activity'>('audit');
  const [actionFilter, setActionFilter] = useState('');

  const audit = useQuery({
    queryKey: ['audit-log', actionFilter],
    queryFn: async (): Promise<AuditRow[]> => {
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (actionFilter) q = q.ilike('action', `%${actionFilter}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    enabled: tab === 'audit',
  });

  const activity = useQuery({
    queryKey: ['activity-log', actionFilter],
    queryFn: async (): Promise<ActivityRow[]> => {
      let q = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (actionFilter) q = q.ilike('action', `%${actionFilter}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    enabled: tab === 'activity',
  });

  const meta =
    tab === 'audit'
      ? `${audit.data?.length ?? 0} privilegiyalı qeyd`
      : `${activity.data?.length ?? 0} aktivlik qeydi`;

  return (
    <>
      <PageHead
        meta={meta}
        title="Audit jurnalı"
        actions={
          <input
            className="input max-w-[200px]"
            placeholder="Hadisəni filtrlə…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        }
      />

      <div className="flex gap-2 mb-4">
        {(['audit', 'activity'] as const).map((t) => (
          <button
            key={t}
            className={`chip ${tab === t ? 'chip-brand' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'audit' ? 'Privilegiya (audit_log)' : 'CRUD (activity_log)'}
          </button>
        ))}
      </div>

      {tab === 'audit' ? <AuditTable rows={audit.data ?? []} loading={audit.isLoading} /> : null}
      {tab === 'activity' ? (
        <ActivityTable rows={activity.data ?? []} loading={activity.isLoading} />
      ) : null}
    </>
  );
}

function AuditTable({ rows, loading }: { rows: AuditRow[]; loading: boolean }) {
  if (loading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Privileged audit qeydi yoxdur.
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Vaxt', 'Aktor', 'Hadisə', 'Resurs', 'IP'].map((h) => (
              <th
                key={h}
                className="text-left py-3 px-3 text-meta"
                style={{
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                {formatDate(r.created_at, { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                {r.actor_id ? r.actor_id.slice(0, 8) : 'sistem'}
              </td>
              <td className="py-2 px-3 font-medium">{r.action}</td>
              <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-soft)' }}>
                {r.resource ?? '—'}
              </td>
              <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                {r.ip ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTable({ rows, loading }: { rows: ActivityRow[]; loading: boolean }) {
  if (loading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Aktivlik qeydi yoxdur.
      </div>
    );
  }
  return (
    <ul className="card divide-y" style={{ borderColor: 'var(--line-soft)' }}>
      {rows.map((r) => {
        const href = activityHref(r.entity_type, r.entity_id);
        return (
          <li key={r.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
            <span
              aria-hidden
              className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: 'var(--brand-action)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-body">
                <span className="font-medium">{r.action}</span>{' '}
                {href ? (
                  <Link to={href} style={{ color: 'var(--brand-text)' }}>
                    ({r.entity_type})
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>({r.entity_type})</span>
                )}
                {r.field_name ? (
                  <span className="text-meta ml-2" style={{ color: 'var(--text-muted)' }}>
                    · {r.field_name}
                  </span>
                ) : null}
              </div>
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {r.user_id ? `${r.user_id.slice(0, 8)} · ` : ''}
                {relativeTime(r.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
