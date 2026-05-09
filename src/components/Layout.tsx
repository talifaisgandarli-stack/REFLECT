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
  const { setCmdK, toggleMirai, toggleSidebar } = useUI();
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
      <a href="#main-content" className="skip-link">
        Əsas məzmuna keç
      </a>
      <Sidebar />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 px-4 lg:px-10 py-4 lg:py-6 max-w-[1600px] mx-auto w-full"
      >
        {session ? (
          <div className="flex justify-between items-center mb-3 lg:mb-2">
            <button
              type="button"
              className="btn-ghost lg:hidden"
              aria-label="Menyu"
              onClick={toggleSidebar}
              style={{ height: 40, width: 40, padding: 0 }}
            >
              <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
                ☰
              </span>
            </button>
            <span className="hidden lg:block" />
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
