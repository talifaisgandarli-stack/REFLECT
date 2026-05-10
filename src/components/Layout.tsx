import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Sidebar, MobileNavToggle } from './Sidebar';
import { MiraiDrawer } from './MiraiDrawer';
import { CmdK } from './CmdK';
import { NotificationBell } from './NotificationBell';
import { useUI, useAuth } from '@/lib/store';
import { useRealtimeSync } from '@/lib/realtime';
import { usePresenceHeartbeat } from '@/lib/hooks';

export function Layout() {
  const { setCmdK, toggleMirai } = useUI();
  const { session } = useAuth();
  const navigate = useNavigate();
  useRealtimeSync(session?.userId);
  usePresenceHeartbeat(session?.userId);

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
  }, [setCmdK, toggleMirai, navigate]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 max-w-[1600px] mx-auto w-full">
        {session ? (
          <div className="flex items-center justify-between mb-2 gap-3">
            <MobileNavToggle />
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
