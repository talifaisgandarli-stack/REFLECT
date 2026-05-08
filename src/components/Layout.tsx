import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MiraiDrawer } from './MiraiDrawer';
import { CmdK } from './CmdK';
import { NotificationsBell } from './NotificationsBell';
import { useEffect } from 'react';
import { useUI } from '@/lib/store';
import {
  usePresenceHeartbeat,
  useRealtimeAnnouncements,
  useRealtimePresence,
} from '@/lib/realtime';

export function Layout() {
  const { setCmdK } = useUI();
  // App-wide channels — owned by Layout so they live for the whole session.
  usePresenceHeartbeat();
  useRealtimePresence();
  useRealtimeAnnouncements();
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
        <Outlet />
      </main>
      <NotificationsBell />
      <MiraiDrawer />
      <CmdK />
    </div>
  );
}
