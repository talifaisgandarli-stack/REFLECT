import { NavLink } from 'react-router-dom';
import { Mascot } from './Mascot';
import { useAuth, useUI } from '@/lib/store';
import { signOut } from '@/lib/auth';

type NavItem = { to: string; label: string; admin?: boolean };
type NavGroup = { label: string; items: NavItem[]; adminGroup?: boolean };

/** Nav contract — PRD §4. Admin-only items hidden for non-admins. */
const NAV: NavGroup[] = [
  {
    label: 'İŞ',
    items: [
      { to: '/', label: 'Dashboard' },
      { to: '/layihelər', label: 'Layihələr' },
      { to: '/tapşırıqlar', label: 'Tapşırıqlar' },
      { to: '/tamamlandı', label: 'Tamamlandı' },
      { to: '/arxiv', label: 'Arxiv' },
      { to: '/podrat', label: 'Podrat İşləri' },
    ],
  },
  {
    label: 'MÜŞTƏRİLƏR',
    adminGroup: true,
    items: [{ to: '/müştərilər', label: 'Müştərilər', admin: true }],
  },
  {
    label: 'MALİYYƏ MƏRKƏZİ',
    adminGroup: true,
    items: [
      { to: '/maliyyə', label: 'Maliyyə Mərkəzi', admin: true },
      { to: '/hesabatlar', label: 'Hesabatlar', admin: true },
    ],
  },
  {
    label: 'KOMANDA',
    items: [
      { to: '/komanda/heyət', label: 'İşçi Heyəti' },
      { to: '/komanda/maaş', label: 'Əmək Haqqı' },
      { to: '/komanda/performans', label: 'Performans' },
      { to: '/komanda/məzuniyyət', label: 'Məzuniyyət' },
      { to: '/komanda/təqvim', label: 'Təqvim' },
      { to: '/komanda/elanlar', label: 'Elanlar' },
      { to: '/komanda/avadanlıq', label: 'Avadanlıq' },
    ],
  },
  {
    label: 'ŞİRKƏT',
    items: [
      { to: '/şirkət/okr', label: 'OKR' },
      { to: '/şirkət/karyera', label: 'Karyera Strukturu' },
      { to: '/şirkət/məzmun', label: 'Məzmun Planlaması', admin: true },
    ],
  },
  {
    label: 'SİSTEM',
    adminGroup: true,
    items: [{ to: '/parametrlər', label: 'Parametrlər', admin: true }],
  },
];

export function Sidebar() {
  const { isAdmin, profile } = useAuth();
  const { sidebarOpen, toggleSidebar } = useUI();

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
            <div key={group.label}>
              <div className="sb-section">{group.label}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="sb-section">MIRAI</div>
        <NavLink to="/mirai" className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}>
          MIRAI
        </NavLink>
        <NavLink
          to="/telegram"
          className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}
        >
          Telegram
        </NavLink>
      </nav>

      {/* Foot — mascot + identity */}
      <div className="p-4 flex items-center gap-3 border-t border-white/5">
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
      </aside>
    </>
  );
}
