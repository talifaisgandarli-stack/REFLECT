import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { MiraiDrawer } from './MiraiDrawer';
import { CmdK } from './CmdK';
import { NotificationBell } from './NotificationBell';
import { useUI, useAuth } from '@/lib/store';
import { useRealtimeSync } from '@/lib/realtime';

const CHORD_TARGETS: Record<string, string> = {
  d: '/',
  t: '/tapşırıqlar',
  p: '/layihelər',
  m: '/müştərilər',
  f: '/maliyyə',
  r: '/hesabatlar',
  c: '/komanda/təqvim',
};

export function Layout() {
  const { setCmdK, toggleMirai } = useUI();
  const { session } = useAuth();
  const nav = useNavigate();
  const chordTimer = useRef<number | null>(null);
  useRealtimeSync(session?.userId);

  useEffect(() => {
    let chordActive = false;

    function isTextField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl-K: command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdK(true);
        return;
      }
      // Cmd/Ctrl-/: toggle MIRAI drawer
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        toggleMirai();
        return;
      }
      if (isTextField(e.target)) return;

      // "g" then <letter> chord — PRD §6.3
      if (!chordActive && e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        chordActive = true;
        if (chordTimer.current) window.clearTimeout(chordTimer.current);
        chordTimer.current = window.setTimeout(() => {
          chordActive = false;
        }, 800);
        return;
      }
      if (chordActive) {
        const k = e.key.toLowerCase();
        const target = CHORD_TARGETS[k];
        chordActive = false;
        if (chordTimer.current) window.clearTimeout(chordTimer.current);
        if (target) {
          e.preventDefault();
          nav(target);
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (chordTimer.current) window.clearTimeout(chordTimer.current);
    };
  }, [setCmdK, toggleMirai, nav]);

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
