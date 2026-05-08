import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MiraiDrawer } from './MiraiDrawer';
import { CmdK } from './CmdK';
import { NotificationBell } from './NotificationBell';
import { useUI, useAuth } from '@/lib/store';

export function Layout() {
  const { setCmdK } = useUI();
  const { session } = useAuth();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdK(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCmdK]);

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
