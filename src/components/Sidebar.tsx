import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
    items: [{ to: '/maliyyə', label: 'Maliyyə Mərkəzi', admin: true }],
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

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, profile } = useAuth();

  return (
    <>
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--brand-text)' }}
        >
          <span className="text-h3" style={{ color: 'var(--brand-action)' }}>R</span>
        </div>
        <span className="font-bold text-h4" style={{ color: 'var(--brand-mist)' }}>Reflect</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
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
                  onClick={onNavigate}
                  className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="sb-section">MIRAI</div>
        <NavLink to="/mirai" onClick={onNavigate} className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}>
          MIRAI
        </NavLink>
        <NavLink to="/telegram" onClick={onNavigate} className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}>
          Telegram
        </NavLink>
      </nav>

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
    </>
  );
}

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUI();
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    if (sidebarOpen) toggleSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, toggleSidebar]);

  return (
    <>
      {/* Desktop: persistent rail */}
      <aside
        className="m-5 w-60 shrink-0 hidden lg:flex flex-col rounded-capsule sticky top-5 self-start max-h-[calc(100vh-2.5rem)]"
        style={{ background: 'var(--ink)' }}
      >
        <SidebarBody />
      </aside>

      {/* Mobile: drawer overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-label="Naviqasiya"
          onClick={toggleSidebar}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(14,22,17,0.5)' }} />
          <aside
            className="absolute top-0 left-0 bottom-0 w-72 flex flex-col"
            style={{ background: 'var(--ink)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarBody onNavigate={toggleSidebar} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function MobileNavToggle() {
  const { toggleSidebar } = useUI();
  return (
    <button
      type="button"
      aria-label="Menyunu aç"
      onClick={toggleSidebar}
      className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg"
      style={{ background: 'var(--ink)', color: 'var(--canvas)' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
