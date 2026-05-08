import { PageHead } from '@/components/PageHead';
import { Mascot } from '@/components/Mascot';
import { Avatar } from '@/components/Avatar';
import { StatusChip } from '@/components/StatusChip';
import { useActivityFeed, useTasks, useTeamPresence } from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import { relativeTime, taskHealth } from '@/lib/format';
import { FocusWidget } from '@/components/FocusWidget';

export function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const { data: tasks = [] } = useTasks(profile?.id ? { assigneeId: profile.id } : undefined);
  const { data: presence = [] } = useTeamPresence();
  const { data: activity = [] } = useActivityFeed(20);

  const today = tasks.filter((t) => t.status === 'active' || t.status === 'review');
  const overdue = tasks.filter((t) => taskHealth(t.deadline) === 'red');

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
            {today.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="rounded-card px-4 py-3 flex items-center justify-between"
                style={{ background: '#1F2925', border: '1px solid #2D3833' }}
              >
                <div>
                  <div className="text-body font-medium">{t.title}</div>
                  <div className="text-meta opacity-70">
                    {t.deadline ? `Son: ${t.deadline}` : 'Müddət yoxdur'}
                  </div>
                </div>
                <StatusChip status={t.status} />
              </li>
            ))}
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
          <Kpi label="Açıq" value={tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).length} />
          <Kpi label="Gecikmiş" value={overdue.length} red />
          <Kpi label="Bu həftə bitirilən" value={tasks.filter((t) => t.status === 'done').length} />
        </section>

        {/* Activity */}
        <section className="lg:col-span-4 card">
          <h3 className="text-h3 mb-3">Yenilənmiş</h3>
          {activity.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Aktivlik yoxdur.
            </div>
          ) : (
            <ul className="space-y-3">
              {activity.slice(0, 6).map((a) => (
                <li key={a.id} className="text-body flex items-start gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                    style={{ background: 'var(--brand-action)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {a.action} · {a.entity_type}
                    </div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {relativeTime(a.created_at)}
                    </div>
                  </div>
                </li>
              ))}
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
            {presence.filter((p) => p.status === 'online').length} onlayn
          </div>
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
