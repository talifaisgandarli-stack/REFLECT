/**
 * REQ-DASH-01..08 — admin + user dashboard variants.
 * REQ-DASH-03: activity feed filter pills (client-side).
 * REQ-DASH-04: health colors.
 * REQ-DASH-06: presence panel with real names + current page + last seen (REQ-PRESENCE-03..04).
 * REQ-DASH-07: FocusWidget (REQ-FOCUS-06).
 * REQ-DASH-08: finance widget removed.
 * US-DASH-05: team workload (open task count per member, green/amber/red).
 */
import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { StatusChip } from '@/components/StatusChip';
import {
  useActivityFeed,
  useRecentAnnouncements,
  useTasks,
  useTeamPresence,
  useUpcomingMeetings,
} from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import { formatDate, relativeTime, taskHealth } from '@/lib/format';
import { FocusWidget } from '@/components/FocusWidget';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// ---------- Activity feed ----------
const ENTITY_LABELS: Record<string, string> = {
  task: 'tapşırıq',
  project: 'layihə',
  client: 'müştəri',
  income: 'gəlir',
  expense: 'xərc',
  outsource_item: 'autsorsinq',
  calendar_event: 'görüş',
};
const ACTION_LABELS: Record<string, string> = {
  created: 'yaratdı',
  updated: 'yenilədi',
  deleted: 'sildi',
  status_changed: 'statusu dəyişdi',
  archived: 'arxivləşdirdi',
  restored: 'bərpa etdi',
  stage_changed: 'mərhələni dəyişdi',
};
function activityLabel(action: string, entityType: string): string {
  return `${ACTION_LABELS[action] ?? action} — ${ENTITY_LABELS[entityType] ?? entityType}`;
}

// REQ-DASH-03 filter types
type ActivityFilter = 'all' | 'task' | 'project' | 'income' | 'expense' | 'client';
const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'Hamısı' },
  { key: 'task', label: 'Tapşırıqlar' },
  { key: 'project', label: 'Layihələr' },
  { key: 'income', label: 'Gəlir' },
  { key: 'expense', label: 'Xərc' },
  { key: 'client', label: 'Müştərilər' },
];

// ---------- Health ----------
const HEALTH_COLOR: Record<'green' | 'amber' | 'red' | 'none', string> = {
  green: '#22C55E',
  amber: '#D97706',
  red: '#EF4444',
  none: '#94A3B8',
};
function HealthLabel({ deadline }: { deadline: string | null | undefined }) {
  const h = taskHealth(deadline);
  if (h === 'none' || !deadline) {
    return <span className="text-meta opacity-70">Müddət yoxdur</span>;
  }
  return (
    <span className="text-meta inline-flex items-center gap-1.5" style={{ color: HEALTH_COLOR[h] }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} />
      Son: {deadline}
    </span>
  );
}

// ---------- Presence ----------
const PRESENCE_DOT: Record<string, string> = {
  online: '#22C55E',
  away: '#D97706',
  offline: '#94A3B8',
};
const PRESENCE_LABEL: Record<string, string> = {
  online: 'Onlayn',
  away: 'Uzaqda',
  offline: 'Oflayn',
};

// ---------- Workload (US-DASH-05) ----------
function workloadColor(count: number): string {
  if (count <= 5) return '#22C55E';
  if (count <= 9) return '#D97706';
  return '#EF4444';
}

export function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const { data: tasks = [] } = useTasks(profile?.id ? { assigneeId: profile.id } : undefined);
  const { data: presence = [] } = useTeamPresence();
  const { data: activity = [] } = useActivityFeed(50);
  const { data: announcements = [] } = useRecentAnnouncements(3);
  const { data: meetings = [] } = useUpcomingMeetings(7);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  // Team tasks for workload (admin only — US-DASH-05)
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks-all-open'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, assignee_ids, status')
        .is('archived_at', null)
        .not('status', 'in', '("done","cancelled")');
      return data ?? [];
    },
  });

  const workloadByMember = useMemo(() => {
    if (!isAdmin) return {};
    const map: Record<string, number> = {};
    for (const t of allTasks) {
      for (const uid of (t.assignee_ids ?? []) as string[]) {
        map[uid] = (map[uid] ?? 0) + 1;
      }
    }
    return map;
  }, [allTasks, isAdmin]);

  const today = tasks
    .filter((t) => t.status === 'active' || t.status === 'review')
    .sort((a, b) => {
      const order = { red: 0, amber: 1, green: 2, none: 3 } as const;
      return order[taskHealth(a.deadline)] - order[taskHealth(b.deadline)];
    });
  const overdue = tasks.filter((t) => taskHealth(t.deadline) === 'red');
  const onlineCount = presence.filter((p) => p.status === 'online').length;

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activity;
    return activity.filter((a) => a.entity_type === activityFilter);
  }, [activity, activityFilter]);

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü' : 'Sizin görünüşünüz'}
        title={`Salam, ${profile?.full_name?.split(' ')[0] ?? 'arxitekt'}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Featured task card */}
        <section className="card-feature lg:col-span-7" style={{ minHeight: 240 }}>
          <span className="chip" style={{ background: 'rgba(14,22,17,0.08)', color: 'var(--ink)' }}>
            BU GÜN
          </span>
          <h2 className="text-h2 mt-3" style={{ color: 'var(--ink)' }}>
            {today[0]?.title ?? 'Bu gün üçün aktiv tapşırıq yoxdur'}
          </h2>
          {today[0]?.deadline ? (
            <div className="mt-2">
              <HealthLabel deadline={today[0].deadline} />
            </div>
          ) : null}
          <p className="text-body mt-2 max-w-md" style={{ color: 'var(--ink)' }}>
            Fokuslan. Bir tapşırıq, 40 dəqiqə.
          </p>
        </section>

        {/* Focus widget — REQ-FOCUS-06 */}
        <FocusWidget className="lg:col-span-5" />

        {/* Today's task ribbon */}
        <section
          className="lg:col-span-8 rounded-card p-5"
          style={{ background: 'var(--ink)', color: 'var(--canvas)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h3" style={{ color: 'var(--brand-action)' }}>BU GÜN</h3>
            <a href="/tapşırıqlar" className="text-meta opacity-80 hover:opacity-100">
              Hamısına bax →
            </a>
          </div>
          <ul className="space-y-2">
            {today.slice(0, 5).map((t) => {
              const h = taskHealth(t.deadline);
              return (
                <li
                  key={t.id}
                  className="rounded-card px-4 py-3 flex items-center justify-between"
                  style={{
                    background: '#1F2925',
                    border: '1px solid #2D3833',
                    borderLeft: `3px solid ${HEALTH_COLOR[h]}`,
                  }}
                >
                  <div>
                    <div className="text-body font-medium">{t.title}</div>
                    <div className="text-meta opacity-70">
                      {t.deadline ? `Son: ${t.deadline}` : 'Müddət yoxdur'}
                    </div>
                  </div>
                  <StatusChip status={t.status} />
                </li>
              );
            })}
            {today.length === 0 ? (
              <li className="opacity-70 text-meta py-4 text-center">Aktiv tapşırıq yoxdur.</li>
            ) : null}
          </ul>
        </section>

        {/* KPI */}
        <section className="lg:col-span-4 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Açıq" value={tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).length} />
            <Kpi label="Gecikmiş" value={overdue.length} red />
            <Kpi label="Tamamlandı" value={tasks.filter((t) => t.status === 'done').length} />
          </div>

          {/* Folder nav grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Layihələr', href: '/layihelər', cls: 'bg-grad-folder-sage' },
              { label: 'Müştərilər', href: '/müştərilər', cls: 'bg-grad-folder-lime' },
              { label: 'Maliyyə', href: '/maliyyə', cls: 'bg-grad-folder-forest' },
              { label: 'Komanda', href: '/komanda/heyət', cls: 'bg-grad-folder-peach' },
            ].map((f) => (
              <a
                key={f.label}
                href={f.href}
                className={`rounded-card p-4 min-h-[80px] flex items-end card-interactive ${f.cls}`}
                style={{ color: 'var(--ink)', textDecoration: 'none' }}
              >
                <span className="text-h3 font-bold">{f.label}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Activity feed — REQ-DASH-03 filter pills */}
        <section className="lg:col-span-5 card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-h3">Yenilənmiş</h3>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ACTIVITY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActivityFilter(f.key)}
                className="chip"
                style={{
                  background: activityFilter === f.key ? 'var(--brand-action)' : 'var(--surface-mist)',
                  color: activityFilter === f.key ? 'var(--ink)' : 'var(--text-muted)',
                  fontWeight: activityFilter === f.key ? 600 : 400,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filteredActivity.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Aktivlik yoxdur.
            </div>
          ) : (
            <ul className="space-y-3 max-h-[320px] overflow-y-auto">
              {filteredActivity.slice(0, 20).map((a) => {
                const actor = a.profiles;
                const name = actor?.full_name ?? 'Sistem';
                return (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">
                      <Avatar name={name} size={28} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-body truncate">
                        <span className="font-medium">{name}</span>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          {activityLabel(a.action, a.entity_type)}
                        </span>
                      </div>
                      <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                        {relativeTime(a.created_at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Presence panel — REQ-PRESENCE-03..04 */}
        <section className="lg:col-span-3 card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h3">Komanda</h3>
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {onlineCount} onlayn
            </span>
          </div>
          {presence.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Heç kim onlayn deyil.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {presence.map((p) => {
                const name = p.profiles?.full_name ?? p.user_id.slice(0, 8);
                const isOffline = p.status === 'offline';
                return (
                  <li key={p.user_id} className="flex items-center gap-2">
                    <span className="relative shrink-0">
                      <Avatar name={name} size={32} />
                      <span
                        className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                        style={{
                          background: PRESENCE_DOT[p.status] ?? '#94A3B8',
                          borderColor: 'var(--surface)',
                        }}
                        aria-label={PRESENCE_LABEL[p.status]}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-body truncate font-medium text-sm">{name}</div>
                      <div className="text-meta truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {isOffline
                          ? p.last_heartbeat_at
                            ? `${relativeTime(p.last_heartbeat_at)} görünüb`
                            : 'Oflayn'
                          : (p.current_page ?? PRESENCE_LABEL[p.status])}
                        {p.session_type === 'mobile' ? ' 📱' : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Team workload — US-DASH-05 (admin only) */}
        {isAdmin ? (
          <section className="lg:col-span-4 card">
            <h3 className="text-h3 mb-3">Komanda yükü</h3>
            {presence.length === 0 ? (
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Komanda üzvü yoxdur.
              </div>
            ) : (
              <ul className="space-y-2">
                {presence.map((p) => {
                  const name = p.profiles?.full_name ?? p.user_id.slice(0, 8);
                  const count = workloadByMember[p.user_id] ?? 0;
                  const barColor = workloadColor(count);
                  const barPct = Math.min(100, (count / 15) * 100);
                  return (
                    <li key={p.user_id} className="flex items-center gap-2">
                      <Avatar name={name} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-meta mb-0.5">
                          <span className="truncate font-medium">{name}</span>
                          <span style={{ color: barColor, fontVariantNumeric: 'tabular-nums' }}>
                            {count}
                          </span>
                        </div>
                        <div
                          className="h-1.5 rounded-full"
                          style={{ background: 'var(--line-soft)' }}
                        >
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${barPct}%`, background: barColor }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {/* Upcoming meetings */}
        <section className={`${isAdmin ? 'lg:col-span-4' : 'lg:col-span-6'} card`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h3">Yaxınlaşan görüşlər</h3>
            <a href="/komanda/təqvim" className="text-meta" style={{ color: 'var(--brand-text)' }}>
              Təqvimə bax →
            </a>
          </div>
          {meetings.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Bu həftə görüş yoxdur.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
              {meetings.map((m) => (
                <li key={m.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-medium truncate">{m.title}</div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(m.starts_at, { hour: '2-digit', minute: '2-digit' })}
                      {m.location ? ` · ${m.location}` : ''}
                    </div>
                  </div>
                  {m.meet_url ? (
                    <a
                      href={m.meet_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="chip chip-brand shrink-0"
                    >
                      Meet
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Latest announcements */}
        <section className={`${isAdmin ? 'lg:col-span-4' : 'lg:col-span-6'} card`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h3">Son elanlar</h3>
            <a href="/komanda/elanlar" className="text-meta" style={{ color: 'var(--brand-text)' }}>
              Hamısı →
            </a>
          </div>
          {announcements.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Hələ elan yoxdur.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
              {announcements.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="text-body font-medium truncate">{a.title}</div>
                  <div className="text-meta flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    {a.category ? <span>{a.category}</span> : null}
                    <span>·</span>
                    <span>{relativeTime(a.published_at ?? a.created_at)}</span>
                    {a.mirai_generated ? (
                      <span
                        className="chip"
                        style={{
                          background: 'rgba(173,251,73,0.12)',
                          color: 'var(--brand-text)',
                          height: 18,
                          padding: '0 6px',
                        }}
                      >
                        MIRAI
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, red }: { label: string; value: number; red?: boolean }) {
  return (
    <div className="card flex flex-col">
      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="text-h2 mt-1"
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: red && value > 0 ? '#B91C1C' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
