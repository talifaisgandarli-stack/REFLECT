/**
 * REQ-AUTH-01 — Idle session warning. PRD specifies session=7d, idle=24h.
 * We surface a non-blocking modal 5 minutes before the idle threshold so the
 * user can extend (refreshSession) or sign out gracefully instead of being
 * silently logged out mid-task.
 *
 * Activity = mouse, keyboard, touch, scroll. Throttled to 1×/min via ref.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { signOut } from '@/lib/auth';

const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;
const WARN_BEFORE_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;

export function IdleSessionWarning() {
  const { session } = useAuth();
  const lastActivityRef = useRef<number>(Date.now());
  const [warnOpen, setWarnOpen] = useState(false);
  const [remainingSec, setRemainingSec] = useState(WARN_BEFORE_MS / 1000);

  useEffect(() => {
    if (!session?.userId) return;

    const mark = () => {
      const now = Date.now();
      // Throttle: only update if 60s since last mark
      if (now - lastActivityRef.current > 60_000) {
        lastActivityRef.current = now;
      }
    };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const tick = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const untilExpiry = IDLE_LIMIT_MS - idleMs;

      if (untilExpiry <= 0) {
        void signOut();
        return;
      }
      if (untilExpiry <= WARN_BEFORE_MS) {
        setRemainingSec(Math.ceil(untilExpiry / 1000));
        setWarnOpen(true);
      } else {
        setWarnOpen(false);
      }
    }, TICK_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(tick);
    };
  }, [session?.userId]);

  async function extend() {
    lastActivityRef.current = Date.now();
    setWarnOpen(false);
    // Refresh the Supabase session token so the server-side clock resets too.
    await supabase.auth.refreshSession();
  }

  if (!warnOpen) return null;

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sessiya bitir"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.55)' }}
    >
      <div className="card w-full max-w-sm" style={{ padding: 24 }}>
        <h2 className="text-h3" style={{ marginBottom: 8 }}>
          Sessiya bitir
        </h2>
        <p className="text-body" style={{ color: 'var(--text-muted)' }}>
          Hərəkətsizlik səbəbindən sessiyanız təxminən{' '}
          <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {mins}d {secs.toString().padStart(2, '0')}s
          </span>{' '}
          sonra bitəcək.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn-outline" onClick={() => void signOut()}>
            Çıxış
          </button>
          <button type="button" className="btn-primary" onClick={() => void extend()}>
            Davam et
          </button>
        </div>
      </div>
    </div>
  );
}
