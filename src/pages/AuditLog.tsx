/**
 * Audit log viewer (PRD §9.4) — admin only.
 * Reads audit_log + activity_log together so the page covers both
 * privileged actions (audit_log: role/policy changes via api/*) and
 * data-touch history (activity_log: trigger-emitted CRUD events).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { formatDate, relativeTime } from '@/lib/format';
import { actionLabelKey, activityDiffSummary, activityHref, entityLabelKey } from '@/lib/activity';
import { useT } from '@/lib/i18n';

type ProfileLite = { id: string; full_name: string | null; email: string };

function actorLabel(
  id: string | null | undefined,
  byId: Map<string, ProfileLite>,
  systemLabel: string,
): string {
  if (!id) return systemLabel;
  const p = byId.get(id);
  if (!p) return id.slice(0, 8);
  return p.full_name ?? p.email;
}

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

type EntityFilter = 'all' | 'task' | 'project' | 'client' | 'task_comment';

export function AuditLogPage() {
  const t = useT();
  const [tab, setTab] = useState<'audit' | 'activity'>('audit');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');

  const profiles = useQuery({
    queryKey: ['audit', 'profiles'],
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email');
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });

  const profilesById = useMemo(() => {
    const map = new Map<string, ProfileLite>();
    for (const p of profiles.data ?? []) map.set(p.id, p);
    return map;
  }, [profiles.data]);

  const entityFilters: EntityFilter[] = ['all', 'task', 'project', 'client', 'task_comment'];

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
    queryKey: ['activity-log', actionFilter, entityFilter],
    queryFn: async (): Promise<ActivityRow[]> => {
      let q = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (actionFilter) q = q.ilike('action', `%${actionFilter}%`);
      if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    enabled: tab === 'activity',
  });

  const meta =
    tab === 'audit'
      ? t('audit.meta.audit', { count: audit.data?.length ?? 0 })
      : t('audit.meta.activity', { count: activity.data?.length ?? 0 });

  return (
    <>
      <PageHead
        meta={meta}
        title={t('audit.title')}
        actions={
          <input
            className="input max-w-[200px]"
            placeholder={t('audit.action_filter')}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['audit', 'activity'] as const).map((tname) => (
          <button
            key={tname}
            className={`chip ${tab === tname ? 'chip-brand' : ''}`}
            onClick={() => setTab(tname)}
          >
            {t(`audit.tab.${tname}`)}
          </button>
        ))}
      </div>

      {tab === 'activity' ? (
        <div
          className="flex gap-2 mb-4 flex-wrap"
          role="tablist"
          aria-label={t('audit.entity_filter_aria')}
        >
          {entityFilters.map((e) => (
            <button
              key={e}
              role="tab"
              aria-selected={entityFilter === e}
              className={`chip ${entityFilter === e ? 'chip-brand' : ''}`}
              onClick={() => setEntityFilter(e)}
            >
              {e === 'all' ? t('audit.entity.all') : t(entityLabelKey(e))}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'audit' ? (
        <AuditTable
          rows={audit.data ?? []}
          loading={audit.isLoading}
          profilesById={profilesById}
        />
      ) : null}
      {tab === 'activity' ? (
        <ActivityTable
          rows={activity.data ?? []}
          loading={activity.isLoading}
          profilesById={profilesById}
        />
      ) : null}
    </>
  );
}

function AuditTable({
  rows,
  loading,
  profilesById,
}: {
  rows: AuditRow[];
  loading: boolean;
  profilesById: Map<string, ProfileLite>;
}) {
  const t = useT();
  if (loading) return <div className="card text-meta">{t('common.loading')}</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        {t('audit.empty.audit')}
      </div>
    );
  }
  const headers = [
    t('audit.col.time'),
    t('audit.col.actor'),
    t('audit.col.action'),
    t('audit.col.resource'),
    t('audit.col.ip'),
  ];
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {headers.map((h) => (
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
                {actorLabel(r.actor_id, profilesById, t('audit.actor.system'))}
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

function ActivityTable({
  rows,
  loading,
  profilesById,
}: {
  rows: ActivityRow[];
  loading: boolean;
  profilesById: Map<string, ProfileLite>;
}) {
  const t = useT();
  if (loading) return <div className="card text-meta">{t('common.loading')}</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        {t('audit.empty.activity')}
      </div>
    );
  }
  return (
    <ul className="card divide-y" style={{ borderColor: 'var(--line-soft)' }}>
      {rows.map((r) => {
        const href = activityHref(r.entity_type, r.entity_id);
        const actor = actorLabel(r.user_id, profilesById, t('audit.actor.system'));
        return (
          <li key={r.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
            <span
              aria-hidden
              className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: 'var(--brand-action)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-body">
                <span className="font-medium">{t(actionLabelKey(r.action))}</span>{' '}
                {href ? (
                  <Link to={href} style={{ color: 'var(--brand-text)' }}>
                    ({t(entityLabelKey(r.entity_type))})
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    ({t(entityLabelKey(r.entity_type))})
                  </span>
                )}
                {r.field_name ? (
                  <span className="text-meta ml-2" style={{ color: 'var(--text-muted)' }}>
                    · {activityDiffSummary(r.field_name, r.old_value, r.new_value, t)}
                  </span>
                ) : null}
              </div>
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {actor} · {relativeTime(r.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
