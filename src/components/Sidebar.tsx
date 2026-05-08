import { NavLink } from 'react-router-dom';
import { Mascot } from './Mascot';
import { useAuth } from '@/lib/store';
import { signOut } from '@/lib/auth';
import { useUnreadAnnouncementCount } from '@/lib/dashboard';

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

export function Sidebar() {
  const { isAdmin, profile } = useAuth();
  const { count: unread } = useUnreadAnnouncementCount();

  return (
    <aside
      className="m-5 w-60 shrink-0 hidden lg:flex flex-col rounded-capsule sticky top-5 self-start max-h-[calc(100vh-2.5rem)]"
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

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.filter((g) => !(g.adminGroup && !isAdmin)).map((group) => {
          const items = group.items.filter((i) => !i.admin || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="sb-section">{group.label}</div>
              {items.map((item) => {
                const badge =
                  item.to === '/komanda/elanlar' && unread > 0 ? unread : null;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `sb-item mx-2 ${isActive ? 'active' : ''}`}
                  >
                    <span className="flex-1">{item.label}</span>
                    {badge != null ? (
                      <span
                        className="text-tiny px-1.5 rounded-chip"
                        style={{
                          background: 'var(--brand-action)',
                          color: 'var(--brand-text)',
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: 18,
                          textAlign: 'center',
                        }}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
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
  );
}
