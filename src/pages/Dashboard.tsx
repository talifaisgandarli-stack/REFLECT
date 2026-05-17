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
import { Link } from 'react-router-dom';
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
import { useAuth, useUI } from '@/lib/store';
import { formatDate, relativeTime, taskHealth } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { useRecentEntries } from '@/lib/useRecentlyViewed';
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
  green: 'var(--success)',
  amber: 'var(--warning)',
  red: 'var(--error)',
  none: 'var(--info)',
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
  online: 'var(--presence-online)',
  away: 'var(--presence-away)',
  offline: 'var(--presence-offline)',
};
const PRESENCE_LABEL: Record<string, string> = {
  online: 'Onlayn',
  away: 'Uzaqda',
  offline: 'Oflayn',
};

// ---------- Workload (US-DASH-05) ----------
function workloadColor(count: number): string {
  if (count <= 5) return 'var(--success)';
  if (count <= 9) return 'var(--warning)';
  return 'var(--error)';
}

// PRD §UX — time-of-day greeting (Asia/Baku) so the dashboard feels alive.
// 05–11 sabahın xeyir · 11–17 salam · 17–22 axşamın xeyir · 22–05 gecən xeyir
function greetingFor(now: Date): string {
  const bakuHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Baku' })
      .format(now),
  );
  if (bakuHour >= 5 && bakuHour < 11) return 'Sabahın xeyir';
  if (bakuHour >= 11 && bakuHour < 17) return 'Salam';
  if (bakuHour >= 17 && bakuHour < 22) return 'Axşamın xeyir';
  return 'Gecən xeyir';
}

export function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const { openTaskCreate } = useUI();
  const { data: tasks = [] } = useTasks(profile?.id ? { assigneeId: profile.id } : undefined);
  const { data: presence = [] } = useTeamPresence();
  // REQ-DASH-02 / PRD §9.1 — admin sees firm-wide; users see only their own
  // (the activity_log RLS policy is permissive, so the gating must happen here).
  const { data: activity = [] } = useActivityFeed(50, isAdmin ? 'firm' : profile?.id ?? 'firm');
  const { data: announcements = [] } = useRecentAnnouncements(3);
  const { data: meetings = [] } = useUpcomingMeetings(7);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  // US-DASH-02 — "Bu gün" / "Bu həftə" tab toggle (user dashboard only)
  const [taskTab, setTaskTab] = useState<'today' | 'week'>('today');

  // PRD §MODULE 9.2 — surface user's career level in the dashboard greeting
  // so they always have visibility into their growth track without navigating.
  // career_level_id lives on profiles (migration 0021) but isn't in the hand-written
  // Profile type yet; read it via a narrow cast.
  const careerLevelId = (profile as { career_level_id?: string | null } | null)?.career_level_id ?? null;
  const { data: careerLevel } = useQuery({
    queryKey: ['career-level-current', careerLevelId],
    enabled: !!careerLevelId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('career_levels')
        .select('name, level_index')
        .eq('id', careerLevelId!)
        .maybeSingle();
      return data as { name: string; level_index: number } | null;
    },
  });

  // REQ-DASH-02 — personal OKR progress (non-admin only)
  const { data: personalOkrs = [] } = useQuery({
    queryKey: ['okrs', 'personal', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('okrs')
        .select('*, key_results(*)')
        .eq('scope', 'personal')
        .eq('employee_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(3);
      return (data ?? []) as Array<{ id: string; objective: string; period: string; key_results: Array<{ current_value: number; target_value: number; title: string }> }>;
    },
    enabled: !isAdmin && !!profile?.id,
  });

  // Team tasks for workload (admin only — US-DASH-05)
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks-all-open'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, assignee_ids, status')
        .is('archived_at', null)
        .not('status', 'in', '("done","cancelled")')
        .limit(500);
      return data ?? [];
    },
  });

  // REQ-DASH-01 — admin active project health widget
  const { data: activeProjects = [] } = useQuery({
    queryKey: ['projects-active-health'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, phases, deadline, status')
        .eq('status', 'active')
        .is('archived_at', null)
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(8);
      return (data ?? []) as Array<{
        id: string;
        name: string;
        phases: string[] | null;
        deadline: string | null;
        status: string;
      }>;
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

  // US-DASH-02: filter by deadline date (not status) for user task tabs
  const todayStr = new Date().toISOString().slice(0, 10);
  const endOfWeekStr = (() => {
    const d = new Date();
    const diff = 7 - (d.getDay() === 0 ? 7 : d.getDay());
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  })();

  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const overdueTasks = openTasks.filter((t) => t.deadline && t.deadline < todayStr);
  const todayTasks = openTasks.filter((t) => t.deadline === todayStr);
  const weekTasks = openTasks.filter((t) => t.deadline && t.deadline > todayStr && t.deadline <= endOfWeekStr);

  const tabTasks = taskTab === 'today'
    ? [...overdueTasks, ...todayTasks]
    : [...overdueTasks, ...todayTasks, ...weekTasks];

  // Legacy sort for admin "BU GÜN" feature card (active/review)
  const today = tasks
    .filter((t) => t.status === 'active' || t.status === 'review')
    .sort((a, b) => {
      const order = { red: 0, amber: 1, green: 2, none: 3 } as const;
      return order[taskHealth(a.deadline)] - order[taskHealth(b.deadline)];
    });
  const overdue = tasks.filter((t) => taskHealth(t.deadline) === 'red');
  const onlineCount = presence.filter((p) => p.status === 'online').length;
  // REQ-PRESENCE — show breakdown (online/away/offline) so admin sees full picture
  const awayCount = presence.filter((p) => p.status === 'away').length;
  const offlineCount = presence.filter((p) => p.status === 'offline').length;

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activity;
    return activity.filter((a) => a.entity_type === activityFilter);
  }, [activity, activityFilter]);

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü' : 'Sizin görünüşünüz'}
        title={`${greetingFor(new Date())}, ${profile?.full_name?.split(' ')[0] ?? 'arxitekt'}`}
        actions={
          /* REQ-DASH-01 — MIRAI quick-launch; nav group removed per PRD §4 */
          <div className="flex items-center gap-2">
            {careerLevel ? (
              <Link
                to="/şirkət/karyera"
                className="chip"
                style={{
                  background: 'var(--brand-glow-sm)',
                  color: 'var(--brand-text)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title={`Karyera səviyyəsi: L${careerLevel.level_index}`}
              >
                L{careerLevel.level_index} · {careerLevel.name}
              </Link>
            ) : null}
            <Link to="/mirai" className="btn-primary" style={{ fontSize: 13 }}>
              ✦ MIRAI
            </Link>
          </div>
        }
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
          {/* PRD §UX — empty state CTA so the card isn't a dead end */}
          {!today[0] ? (
            <button
              type="button"
              className="btn-primary mt-4"
              style={{ background: 'var(--ink)', color: 'var(--brand-action)' }}
              onClick={() => openTaskCreate()}
            >
              + Bu günə tapşırıq əlavə et
            </button>
          ) : null}
        </section>

        {/* Focus widget — REQ-FOCUS-06 */}
        <FocusWidget className="lg:col-span-5" />

        {/* Today's task ribbon — US-DASH-02: Bu gün / Bu həftə tabs */}
        <section
          className="lg:col-span-8 rounded-card p-5"
          style={{ background: 'var(--ink)', color: 'var(--canvas)' }}
        >
          <div className="flex items-center justify-between mb-3">
            {/* Tab toggle — US-DASH-02 */}
            <div className="flex gap-1">
              {(['today', 'week'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className="chip"
                  onClick={() => setTaskTab(tab)}
                  style={{
                    background: taskTab === tab ? 'var(--brand-action)' : 'rgba(255,255,255,0.08)',
                    color: taskTab === tab ? 'var(--ink)' : 'var(--canvas)',
                    fontWeight: taskTab === tab ? 700 : 400,
                    fontSize: 12,
                    letterSpacing: '0.06em',
                  }}
                >
                  {tab === 'today' ? 'BU GÜN' : 'BU HƏFTƏ'}
                </button>
              ))}
            </div>
            <a href="/tapşırıqlar" className="text-meta opacity-80 hover:opacity-100" style={{ color: 'var(--canvas)' }}>
              Hamısına bax →
            </a>
          </div>
          <ul className="space-y-2">
            {tabTasks.slice(0, 6).map((t) => {
              const isOv = overdueTasks.some((x) => x.id === t.id);
              const h = isOv ? 'red' : taskHealth(t.deadline);
              return (
                <li
                  key={t.id}
                  className="rounded-card px-4 py-3 flex items-center justify-between"
                  style={{
                    background: 'var(--card-dark-bg)',
                    border: '1px solid var(--card-dark-border)',
                    borderLeft: `3px solid ${HEALTH_COLOR[h]}`,
                  }}
                >
                  <div>
                    <div className="text-body font-medium">{t.title}</div>
                    <div className="text-meta opacity-70">
                      {t.deadline
                        ? isOv
                          ? `Gecikmiş: ${t.deadline}`
                          : `Son: ${t.deadline}`
                        : 'Müddət yoxdur'}
                    </div>
                  </div>
                  <StatusChip status={t.status} />
                </li>
              );
            })}
            {tabTasks.length === 0 ? (
              <li className="opacity-70 text-meta py-4 text-center">
                {taskTab === 'today' ? 'Bu gün üçün tapşırıq yoxdur.' : 'Bu həftə üçün tapşırıq yoxdur.'}
              </li>
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

          {/* Folder nav grid — admin-only cards filtered for users */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Layihələr', href: '/layihelər', cls: 'bg-grad-folder-sage', adminOnly: false },
              { label: 'Müştərilər', href: '/müştərilər', cls: 'bg-grad-folder-lime', adminOnly: true },
              { label: 'Maliyyə', href: '/maliyyə', cls: 'bg-grad-folder-forest', adminOnly: true },
              { label: 'Komanda', href: '/komanda/heyət', cls: 'bg-grad-folder-peach', adminOnly: false },
            ].filter((f) => isAdmin || !f.adminOnly).map((f) => (
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

        {/* REQ-DASH-01 — admin active project health */}
        {isAdmin ? (
          <section className="lg:col-span-12 card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-h3">Aktiv layihələr</h3>
              <a href="/layihelər" className="text-meta" style={{ color: 'var(--text-muted)' }}>Hamısına bax →</a>
            </div>
            {activeProjects.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  Aktiv layihə yoxdur.
                </p>
                <a href="/layihelər" className="btn-primary text-meta" style={{ padding: '6px 12px' }}>
                  + Yeni layihə yarat
                </a>
              </div>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {activeProjects.map((p) => {
                  const h = taskHealth(p.deadline);
                  return (
                    <li key={p.id} className="rounded-card p-3" style={{ background: 'var(--surface-mist)', borderLeft: `3px solid ${HEALTH_COLOR[h]}` }}>
                      <a href={`/layihelər/${p.id}`} className="block" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className="text-body font-medium truncate">{p.name}</div>
                        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          {(p.phases && p.phases.length > 0) ? p.phases[p.phases.length - 1] : 'Faza yoxdur'}
                        </div>
                        <div className="text-meta mt-1" style={{ color: HEALTH_COLOR[h] }}>
                          {p.deadline ? `Son: ${formatDate(p.deadline)}` : 'Müddət yoxdur'}
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {/* PRD §UX — favorited projects + recently viewed (local) */}
        <FavoriteProjectsWidget />
        <RecentlyViewedWidget />

        {/* Activity feed — REQ-DASH-03 filter pills */}
        <section className="lg:col-span-5 card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-h3">Yenilənmiş</h3>
            {/* PRD §UX — export filtered activity to CSV */}
            <button
              type="button"
              className="chip"
              style={{ color: 'var(--text-muted)', fontSize: 11 }}
              disabled={filteredActivity.length === 0}
              onClick={() => {
                downloadCsv(
                  `activity-${new Date().toISOString().slice(0, 10)}`,
                  ['Vaxt', 'Kim', 'Action', 'Entity'],
                  filteredActivity.map((a) => ({
                    Vaxt: new Date(a.created_at).toISOString(),
                    Kim: a.profiles?.full_name ?? 'Sistem',
                    Action: a.action,
                    Entity: a.entity_type,
                  })),
                );
              }}
            >
              ↓ CSV
            </button>
          </div>
          {/* Activity heatmap — last 12 weeks of personal activity, GitHub-style */}
          <ActivityHeatmap activity={activity} userId={isAdmin ? null : profile?.id ?? null} />
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
            <ul className="space-y-3 max-h-[400px] overflow-y-auto">
              {filteredActivity.map((a) => {
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
            <span
              className="text-meta inline-flex items-center gap-2"
              style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
              title={`${onlineCount} onlayn · ${awayCount} uzaqda · ${offlineCount} oflayn`}
            >
              <span style={{ color: 'var(--presence-online)' }}>● {onlineCount}</span>
              {awayCount > 0 ? <span style={{ color: 'var(--presence-away)' }}>● {awayCount}</span> : null}
              <span style={{ color: 'var(--presence-offline)', opacity: 0.7 }}>● {offlineCount}</span>
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
                          background: PRESENCE_DOT[p.status] ?? 'var(--info)',
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
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-h3">Yaxınlaşan görüşlər</h3>
            {/* PRD §UX — surface "minutes-to-next-meeting" so user sees urgency
                at a glance without parsing timestamps. Only shows for meetings
                ≤120 min away; otherwise hidden to avoid clutter. */}
            {(() => {
              const next = meetings[0];
              if (!next) return null;
              const mins = Math.round((new Date(next.starts_at).getTime() - Date.now()) / 60_000);
              if (mins < 0 || mins > 120) return null;
              return (
                <span
                  className="chip"
                  style={{
                    background: mins <= 15 ? 'var(--error-deep, #b3261e)' : 'var(--brand-action)',
                    color: mins <= 15 ? 'white' : 'var(--ink)',
                    fontSize: 11,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  title={`Növbəti: ${next.title}`}
                >
                  {mins <= 0 ? 'İndi' : `${mins} dəq sonra`}
                </span>
              );
            })()}
            <a href="/komanda/təqvim" className="text-meta ml-auto" style={{ color: 'var(--brand-text)' }}>
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
              {announcements.map((a) => {
                // PRD §8.6 — surface unread state inline so user sees what's new
                // without opening the announcements page
                const isUnread = !a.read_by || !(a.read_by as Record<string, boolean>)[profile?.id ?? ''];
                return (
                <li key={a.id} className="py-2">
                  <div className="text-body font-medium truncate flex items-center gap-2">
                    {isUnread ? (
                      <span
                        aria-label="oxunmamış"
                        style={{
                          display: 'inline-block',
                          width: 6, height: 6, borderRadius: 999,
                          background: 'var(--brand-action)', flexShrink: 0,
                        }}
                      />
                    ) : null}
                    {a.title}
                  </div>
                  <div className="text-meta flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    {a.category ? <span>{a.category}</span> : null}
                    <span>·</span>
                    <span>{relativeTime(a.published_at ?? a.created_at)}</span>
                    {a.mirai_generated ? (
                      <span
                        className="chip"
                        style={{
                          background: 'var(--brand-glow-lg)',
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
                );
              })}
            </ul>
          )}
        </section>
        {/* REQ-DASH-02 — Personal OKR progress (non-admin only) */}
        {!isAdmin && personalOkrs.length > 0 ? (
          <section className="lg:col-span-12 card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-h3">Şəxsi OKR</h3>
              <a href="/şirkət/okr" className="text-meta" style={{ color: 'var(--brand-text)' }}>Hamısı →</a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {personalOkrs.map((o) => {
                const krs = o.key_results ?? [];
                const pct = krs.length
                  ? Math.round(krs.reduce((s, kr) => s + (kr.target_value > 0 ? Math.min(1, kr.current_value / kr.target_value) : 0), 0) / krs.length * 100)
                  : 0;
                const color = pct >= 70 ? 'var(--success-deep)' : pct >= 40 ? 'var(--warning)' : 'var(--error-deep)';
                return (
                  <div key={o.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-body font-medium truncate">{o.objective}</span>
                      <span className="text-meta ml-2" style={{ color, fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{o.period}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
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
          color: red && value > 0 ? 'var(--error-deep)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// PRD §6.1 — last-12-weeks activity heatmap (GitHub-style). Counts the
// passed-in activity entries by day. When `userId` is null the heatmap shows
// firm-wide activity (admin); otherwise only that user's events.
function ActivityHeatmap({
  activity,
  userId,
}: {
  activity: Array<{ created_at: string; user_id?: string | null }>;
  userId: string | null;
}) {
  // Bucket by Asia/Baku date
  const counts = new Map<string, number>();
  for (const a of activity) {
    if (userId && a.user_id !== userId) continue;
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date(a.created_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Build 12-week × 7-day grid ending today (right column = current week)
  const WEEKS = 12;
  const today = new Date();
  // Align to last Sunday so columns are weeks
  const cells: Array<{ key: string; date: Date; count: number; dim: boolean }> = [];
  // Start from (WEEKS-1) weeks back at Monday-of-that-week
  const totalDays = WEEKS * 7;
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d);
    cells.push({ key, date: d, count: counts.get(key) ?? 0, dim: false });
  }

  // Determine intensity buckets relative to max count
  const max = Math.max(1, ...cells.map((c) => c.count));
  function intensity(n: number): string {
    if (n === 0) return 'rgba(173, 251, 73, 0.08)';
    const r = n / max;
    if (r < 0.25) return 'rgba(173, 251, 73, 0.3)';
    if (r < 0.5) return 'rgba(173, 251, 73, 0.55)';
    if (r < 0.75) return 'rgba(173, 251, 73, 0.8)';
    return 'rgba(173, 251, 73, 1)';
  }

  // Render as 7 rows × WEEKS columns. Day-of-week of cells[0] dictates row 0.
  const firstDow = cells[0].date.getDay(); // 0=Sun..6=Sat
  // Shift so Monday is row 0
  const dowToRow = (dow: number) => (dow + 6) % 7;
  const rows: Array<Array<{ key: string; count: number } | null>> = Array.from({ length: 7 }, () => Array(WEEKS).fill(null));
  let col = 0;
  let row = dowToRow(firstDow);
  for (const c of cells) {
    rows[row][col] = { key: c.key, count: c.count };
    row++;
    if (row >= 7) { row = 0; col++; }
  }

  const totalEvents = cells.reduce((s, c) => s + c.count, 0);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Son 12 həftə · {totalEvents} aktivlik
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {rows.map((rowCells, ri) => (
          <div key={ri} className="flex gap-0.5">
            {rowCells.map((c, ci) => (
              <div
                key={`${ri}-${ci}`}
                title={c ? `${c.key}: ${c.count} aktivlik` : undefined}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: c ? intensity(c.count) : 'transparent',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// PRD §UX — user's starred projects (migration 0049) as a Dashboard widget
function FavoriteProjectsWidget() {
  const { profile } = useAuth();
  const favs = useQuery({
    queryKey: ['fav-projects-widget', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data: favRows } = await supabase
        .from('project_favorites')
        .select('project_id')
        .eq('user_id', profile!.id);
      const ids = (favRows ?? []).map((r) => r.project_id as string).slice(0, 6);
      if (ids.length === 0) return [];
      const { data: projectRows } = await supabase
        .from('projects')
        .select('id, name, status, deadline')
        .in('id', ids);
      return (projectRows ?? []) as Array<{ id: string; name: string; status: string; deadline: string | null }>;
    },
  });
  const items = favs.data ?? [];
  if (items.length === 0) return null;
  return (
    <section className="lg:col-span-12 card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">★ Sevimli layihələr</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {items.map((p) => (
          <a
            key={p.id}
            href={`/layihelər/${p.id}`}
            className="rounded-card p-3 hover:bg-surface-mist transition-colors"
            style={{ border: '1px solid var(--line)' }}
          >
            <div className="text-body font-medium truncate">{p.name}</div>
            <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {p.status}{p.deadline ? ` · ${p.deadline}` : ''}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

// PRD §UX — last visited entities (local-only, no server query)
function RecentlyViewedWidget() {
  const recents = useRecentEntries();
  if (recents.length === 0) return null;
  return (
    <section className="lg:col-span-12 card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">⏱ Yaxınlarda baxılıb</h3>
        <button
          type="button"
          className="chip"
          style={{ color: 'var(--text-muted)', fontSize: 11 }}
          onClick={() => {
            try { localStorage.removeItem('reflect.recently-viewed'); } catch { /* ignore */ }
            window.dispatchEvent(new CustomEvent('reflect:recent-changed'));
          }}
          title="Tarixçəni təmizlə"
        >
          Təmizlə
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {recents.slice(0, 6).map((r) => (
          <a
            key={`${r.type}-${r.id}`}
            href={r.href}
            className="rounded-card p-3 hover:bg-surface-mist transition-colors"
            style={{ border: '1px solid var(--line)' }}
          >
            <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              {r.type === 'project' ? 'Layihə' : r.type === 'task' ? 'Tapşırıq' : 'Müştəri'}
            </div>
            <div className="text-body font-medium truncate">{r.title}</div>
          </a>
        ))}
      </div>
    </section>
  );
}
