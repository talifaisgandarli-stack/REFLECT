import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Sidebar, MobileNavToggle } from './Sidebar';
import { LiveAnnouncer } from '@/lib/a11y';
import { MiraiDrawer } from './MiraiDrawer';
import { CmdK } from './CmdK';
import { NotificationBell } from './NotificationBell';
import { TaskCreateModal } from './TaskCreateModal';
import { ToastHost } from './Toast';
import { ShortcutHelp } from './ShortcutHelp';
import { useUI, useAuth } from '@/lib/store';
import { useRealtimeSync } from '@/lib/realtime';
import { usePresenceHeartbeat } from '@/lib/hooks';

export function Layout() {
  const { setCmdK, toggleMirai, taskCreateOpen, openTaskCreate, closeTaskCreate } = useUI();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useRealtimeSync(session?.userId);
  usePresenceHeartbeat(session?.userId);

  // PRD §UX — smooth scroll-to-top on route change so long-scrolled pages
  // don't leave the user mid-page after navigation.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // PRD §6.3 — Cmd+N is "context-aware": derive defaultProjectId when on a
  // project detail route so the new task lands in the right project.
  const projectIdMatch = location.pathname.match(/^\/layihelər\/([^/]+)/);
  const defaultProjectId = projectIdMatch?.[1];

  // PRD §6.3 keyboard shortcuts
  const gPending = useRef(false);
  useEffect(() => {
    const G_MAP: Record<string, string> = {
      d: '/',
      t: '/tapşırıqlar',
      p: '/layihelər',
      m: '/müştərilər',
      f: '/maliyyə',
    };
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdK(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        toggleMirai();
        return;
      }
      // PRD §6.3 — Cmd/Ctrl+N opens new-task modal (context-aware)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openTaskCreate();
        return;
      }
      if (e.key === 'Escape') {
        gPending.current = false;
        return;
      }
      if (editing) return;

      if (gPending.current) {
        gPending.current = false;
        const dest = G_MAP[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); navigate(dest); }
        return;
      }
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
        gPending.current = true;
        setTimeout(() => { gPending.current = false; }, 1500);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCmdK, toggleMirai, openTaskCreate, navigate]);

  // Detect platform for the kbd hint label (⌘K on macOS, Ctrl+K elsewhere)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

  return (
    <div className="flex min-h-screen">
      {/* PRD §6.6 a11y — keyboard skip link */}
      <a href="#main-content" className="skip-link">
        Əsas məzmuna keç
      </a>
      <Sidebar />
      <main id="main-content" className="flex-1 px-4 sm:px-6 lg:px-10 py-6 max-w-[1600px] mx-auto w-full">
        {session ? (
          <div className="flex items-center justify-between mb-2 gap-3">
            <MobileNavToggle />
            <div className="flex items-center gap-2">
              {/* PRD §FIN-09 — display Asia/Baku timezone hint */}
              <span
                className="hidden md:inline text-meta"
                style={{ color: 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                title="Bütün tarixlər Bakı vaxtı ilədir"
              >
                {new Date().toLocaleTimeString('az-AZ', { timeZone: 'Asia/Baku', hour: '2-digit', minute: '2-digit' })} · Bakı
              </span>
              {/* PRD §6.3 — discoverable Cmd+K shortcut affordance */}
              <button
                type="button"
                onClick={() => setCmdK(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-btn text-meta hover:opacity-80"
                style={{
                  background: 'var(--ink)',
                  color: 'var(--canvas)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                title="Universal axtarış"
                aria-label="Axtarış (Cmd+K)"
              >
                <span style={{ opacity: 0.6 }}>🔍 Axtar</span>
                <kbd
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 10,
                    background: 'rgba(255,255,255,0.12)',
                    color: 'var(--canvas)',
                    borderRadius: 4,
                    padding: '1px 6px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {isMac ? '⌘K' : 'Ctrl+K'}
                </kbd>
              </button>
              <NotificationBell />
            </div>
          </div>
        ) : null}
        <Outlet />
      </main>
      <MiraiDrawer />
      <CmdK />
      <LiveAnnouncer />
      <ToastHost />
      <ShortcutHelp />
      {/* PRD §6.3 Cmd+N — global new-task modal, context-aware via route */}
      {taskCreateOpen ? (
        <TaskCreateModal onClose={closeTaskCreate} defaultProjectId={defaultProjectId} />
      ) : null}
    </div>
  );
}
