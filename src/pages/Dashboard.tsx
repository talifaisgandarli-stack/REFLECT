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
  const a = ACTION_LABELS[action] ?? action;
  const e = ENTITY_LABELS[entityType] ?? entityType;
  return `${a} — ${e}`;
}

const HEALTH_COLOR: Record<'green' | 'amber' | 'red' | 'none', string> = {
  green: '#22C55E',
  amber: '#D97706',
  red: '#EF4444',
  none: '#94A3B8',
};

function HealthDot({ deadline }: { deadline: string | null | undefined }) {
  const h = taskHealth(deadline);
  return (
    <span
      aria-hidden
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: HEALTH_COLOR[h] }}
    />
  );
}

function HealthLabel({ deadline }: { deadline: string | null | undefined }) {
  const h = taskHealth(deadline);
  if (h === 'none' || !deadline) {
    return <span className="text-meta opacity-70">Müddət yoxdur</span>;
  }
  return (
    <span
      className="text-meta inline-flex items-center gap-1.5"
      style={{
        color: HEALTH_COLOR[h],
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <HealthDot deadline={deadline} />
      Son: {deadline}
    </span>
  );
}

export function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const { data: tasks = [] } = useTasks(profile?.id ? { assigneeId: profile.id } : undefined);
  const { data: presence = [] } = useTeamPresence();
  const { data: activity = [] } = useActivityFeed(20);
  const { data: announcements = [] } = useRecentAnnouncements(3);
  const { data: meetings = [] } = useUpcomingMeetings(7);

  // Active + review = "today's work"; sort red first then amber so the
  // featured card spotlights what actually needs attention (REQ-DASH-04).
  const today = tasks
    .filter((t) => t.status === 'active' || t.status === 'review')
    .sort((a, b) => {
      const order = { red: 0, amber: 1, green: 2, none: 3 } as const;
      return order[taskHealth(a.deadline)] - order[taskHealth(b.deadline)];
    });
  const overdue = tasks.filter((t) => taskHealth(t.deadline) === 'red');
  const onlineCount = presence.filter((p) => p.status === 'online').length;

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü' : 'Sizin görünüşünüz'}
        title={`Salam, ${profile?.full_name?.split(' ')[0] ?? 'arxitekt'}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Featured */}
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

        {/* Focus widget — REQ-FOCUS-* */}
        <FocusWidget className="lg:col-span-5" />

        {/* BU GÜN ribbon */}
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

        {/* Folder grid */}
        <section className="lg:col-span-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Layihələr', cls: 'bg-grad-folder-sage' },
            { label: 'Müştərilər', cls: 'bg-grad-folder-lime' },
            { label: 'Maliyyə', cls: 'bg-grad-folder-forest' },
            { label: 'Komanda', cls: 'bg-grad-folder-peach' },
          ].map((f) => (
            <div
              key={f.label}
              className={`rounded-card p-4 min-h-[100px] flex items-end card-interactive ${f.cls}`}
              style={{ color: 'var(--ink)' }}
            >
              <span className="text-h3 font-bold">{f.label}</span>
            </div>
          ))}
        </section>

        {/* KPI */}
        <section className="lg:col-span-5 grid grid-cols-3 gap-3">
          <Kpi
            label="Açıq"
            value={tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).length}
          />
          <Kpi label="Gecikmiş" value={overdue.length} red />
          <Kpi label="Bu həftə bitirilən" value={tasks.filter((t) => t.status === 'done').length} />
        </section>

        {/* Activity — PRD §6.1 + US-DASH-04: avatar, action, entity link, timestamp */}
        <section className="lg:col-span-4 card">
          <h3 className="text-h3 mb-3">Yenilənmiş</h3>
          {activity.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Aktivlik yoxdur.
            </div>
          ) : (
            <ul className="space-y-3">
              {activity.slice(0, 6).map((a) => {
                const actor = a.profiles;
                const name = actor?.full_name ?? 'Sistem';
                const actionLabel = activityLabel(a.action, a.entity_type);
                return (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5"><Avatar name={name} size={28} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-body truncate">
                        <span className="font-medium">{name}</span>
                        {' '}
                        <span style={{ color: 'var(--text-muted)' }}>{actionLabel}</span>
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

        {/* Presence — REQ-PRESENCE-* */}
        <section className="lg:col-span-3 card">
          <h3 className="text-h3 mb-3">Komanda</h3>
          <div className="flex flex-wrap gap-2">
            {presence.length === 0 ? (
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Heç kim onlayn deyil.
              </div>
            ) : (
              presence.slice(0, 12).map((p) => (
                <Avatar key={p.user_id} name={p.user_id.slice(0, 4)} presence={p.status} size={36} />
              ))
            )}
          </div>
          <div className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
            {onlineCount} onlayn
          </div>
        </section>

        {/* Upcoming meetings — REQ-CAL-* (week ahead) */}
        <section className="lg:col-span-6 card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h3">Yaxınlaşan görüşlər</h3>
            <a
              href="/komanda/təqvim"
              className="text-meta"
              style={{ color: 'var(--brand-text)' }}
            >
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
        <section className="lg:col-span-6 card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-h3">Son elanlar</h3>
            <a
              href="/komanda/elanlar"
              className="text-meta"
              style={{ color: 'var(--brand-text)' }}
            >
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
