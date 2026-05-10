import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { MiraiDrawer } from './MiraiDrawer';
import { CmdK } from './CmdK';
import { NotificationBell } from './NotificationBell';
import { useUI, useAuth } from '@/lib/store';
import { useRealtimeSync } from '@/lib/realtime';

// PRD §6.3 G-navigation map
const G_NAV: Record<string, string> = {
  d: '/',
  t: '/tapşırıqlar',
  p: '/layihelər',
  m: '/müştərilər',
  f: '/maliyyə',
};

export function Layout() {
  const { setCmdK, toggleMirai } = useUI();
  const { session } = useAuth();
  const navigate = useNavigate();
  // Track whether the previous keydown was 'g' for two-key G-nav sequences.
  const gPressed = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeSync(session?.userId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

      // Cmd+K — global search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdK(true);
        return;
      }

      // Cmd+/ — open MIRAI
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        toggleMirai();
        return;
      }

      // Cmd+N — new task (dispatches a custom event; TasksPage listens for it)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('reflect:new-task'));
        return;
      }

      // Escape — close any open modal/panel (handled by individual components)
      if (e.key === 'Escape') return;

      // G-nav: G then D/T/P/M/F — skip if typing in an input
      if (inInput) return;

      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
        gPressed.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => { gPressed.current = false; }, 1000);
        return;
      }

      if (gPressed.current && !e.metaKey && !e.ctrlKey) {
        const dest = G_NAV[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          gPressed.current = false;
          if (gTimer.current) clearTimeout(gTimer.current);
          navigate(dest);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [setCmdK, toggleMirai, navigate]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-6 lg:px-10 py-6 max-w-[1600px] mx-auto w-full">
        {session ? (
          <div className="flex justify-end mb-2">
            <NotificationBell />
          </div>
        ) : null}
        <Outlet />
      </main>
      <MiraiDrawer />
      <CmdK />
    </div>
  );
}
