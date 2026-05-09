import { NavLink } from 'react-router-dom';
import { Mascot } from './Mascot';
import { useAuth, useUI } from '@/lib/store';
import { signOut } from '@/lib/auth';
import { SUPPORTED_LOCALES, useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type NavItem = { to: string; key: string; admin?: boolean };
type NavGroup = { key: string; items: NavItem[]; adminGroup?: boolean };

/** Nav contract — PRD §4. Admin-only items hidden for non-admins.
 *  Labels resolved at render via useT(); locale dictionaries in src/locales/. */
const NAV: NavGroup[] = [
  {
    key: 'nav.work',
    items: [
      { to: '/', key: 'nav.dashboard' },
      { to: '/layihelər', key: 'nav.projects' },
      { to: '/tapşırıqlar', key: 'nav.tasks' },
      { to: '/tamamlandı', key: 'nav.done' },
      { to: '/arxiv', key: 'nav.archive' },
      { to: '/podrat', key: 'nav.outsource' },
    ],
  },
  {
    key: 'nav.clients',
    adminGroup: true,
    items: [{ to: '/müştərilər', key: 'nav.clients', admin: true }],
  },
  {
    key: 'nav.finance',
    adminGroup: true,
    items: [
      { to: '/maliyyə', key: 'nav.finance', admin: true },
      { to: '/hesabatlar', key: 'nav.reports', admin: true },
    ],
  },
  {
    key: 'nav.team',
    items: [
      { to: '/komanda/heyət', key: 'nav.team.roster' },
      { to: '/komanda/maaş', key: 'nav.team.salary' },
      { to: '/komanda/performans', key: 'nav.team.performance' },
      { to: '/komanda/məzuniyyət', key: 'nav.team.leave' },
      { to: '/komanda/təqvim', key: 'nav.team.calendar' },
      { to: '/komanda/elanlar', key: 'nav.team.announcements' },
      { to: '/komanda/avadanlıq', key: 'nav.team.equipment' },
    ],
  },
  {
    key: 'nav.company',
    items: [
      { to: '/şirkət/okr', key: 'nav.company.okr' },
      { to: '/şirkət/karyera', key: 'nav.company.career' },
      { to: '/şirkət/məzmun', key: 'nav.company.content', admin: true },
    ],
  },
  {
    key: 'nav.system',
    adminGroup: true,
    items: [
      { to: '/parametrlər', key: 'nav.system.settings', admin: true },
      { to: '/audit', key: 'nav.system.audit', admin: true },
    ],
  },
];

export function Sidebar() {
  const { isAdmin, profile } = useAuth();
  const { sidebarOpen, toggleSidebar } = useUI();
  const t = useT();

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen ? (
        <div
          aria-hidden
          onClick={toggleSidebar}
          className="lg:hidden fixed inset-0 z-30"
          style={{ background: 'rgba(14,22,17,0.4)' }}
        />
      ) : null}

      <aside
        className={[
          'flex flex-col rounded-capsule self-start',
          // Desktop: stays in flow
          'lg:m-5 lg:w-60 lg:shrink-0 lg:flex lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)]',
          // Mobile: drawer overlay
          'fixed top-0 left-0 z-40 h-full w-[280px] m-3 transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0',
        ].join(' ')}
        style={{ background: 'var(--ink)' }}
      >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--brand-text)' }}
        >
          <span className="text-h3" style={{ color: 'var(--brand-action)' }}>
            R
          </span>
        </div>
        <span className="font-bold text-h4" style={{ color: 'var(--brand-mist)' }}>
          Reflect
        </span>
      </div>

      <nav
        className="flex-1 overflow-y-auto py-2"
        onClick={(e) => {
          // Close drawer on mobile after a nav-link tap (desktop is no-op
          // because lg:translate-x-0 overrides the closed state).
          const target = e.target as HTMLElement;
          if (target.closest('a') && window.innerWidth < 1024 && sidebarOpen) {
            toggleSidebar();
          }
        }}
      >
        {NAV.filter((g) => !(g.adminGroup && !isAdmin)).map((group) => {
          const items = group.items.filter((i) => !i.admin || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.key}>
              <div className="sb-section">{t(group.key)}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="sb-section">{t('nav.mirai')}</div>
        <NavLink to="/mirai" className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}>
          {t('nav.mirai')}
        </NavLink>
        <NavLink
          to="/telegram"
          className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}
        >
          {t('nav.telegram')}
        </NavLink>
      </nav>

      {/* Foot — mascot + identity + locale */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <Mascot size={40} />
          <div className="flex-1 min-w-0">
            <div className="text-ui truncate" style={{ color: 'var(--canvas)' }}>
              {profile?.full_name ?? profile?.email ?? '—'}
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-meta hover:underline"
              style={{ color: 'var(--text-faint)' }}
            >
              Çıxış
            </button>
          </div>
        </div>
        <div className="flex gap-1 mt-3" role="group" aria-label="Dil">
          {SUPPORTED_LOCALES.map((l) => {
            const active = (profile?.locale ?? 'az') === l;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={active}
                disabled={!profile?.id || active}
                onClick={async () => {
                  if (!profile?.id) return;
                  await supabase
                    .from('profiles')
                    .update({ locale: l })
                    .eq('id', profile.id);
                  // Optimistic local refresh — store will reload on next
                  // useAuthBootstrap fire (auth state change isn't fired
                  // for plain UPDATE, so a hard reload is the simplest path
                  // until a profile invalidator is wired).
                  window.location.reload();
                }}
                className="text-tiny px-2 py-1 rounded-btn"
                style={{
                  background: active ? 'rgba(173,251,73,0.18)' : 'transparent',
                  color: active ? 'var(--brand-action)' : 'var(--text-faint)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  cursor: active ? 'default' : 'pointer',
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      </aside>
    </>
  );
}
