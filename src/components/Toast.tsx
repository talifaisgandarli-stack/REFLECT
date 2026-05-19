/**
 * Global toast notification system (PRD §6.7 — transient errors/successes).
 *
 * Usage:
 *   import { toast } from '@/components/Toast';
 *   toast.success('Yadda saxlanıldı');
 *   toast.error('Xəta baş verdi');
 *   toast.info('Qeyd: …');
 *
 * The <ToastHost/> must be mounted once in the app shell (Layout.tsx). Toasts
 * auto-dismiss after 4s and are announced via aria-live for screen readers.
 */
import { useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type ToastAction = { label: string; onClick: () => void };
type ToastEntry = { id: number; kind: ToastKind; message: string; action?: ToastAction };

let nextId = 1;
const listeners = new Set<(entries: ToastEntry[]) => void>();
let entries: ToastEntry[] = [];

function notify() {
  for (const fn of listeners) fn([...entries]);
}

function push(kind: ToastKind, message: string, ttlMs = 4_000, action?: ToastAction) {
  const id = nextId++;
  entries = [...entries, { id, kind, message, action }];
  notify();
  window.setTimeout(() => {
    entries = entries.filter((e) => e.id !== id);
    notify();
  }, ttlMs);
}

export const toast = {
  success: (msg: string, action?: ToastAction) => push('success', msg, 4_000, action),
  error: (msg: string, action?: ToastAction) => push('error', msg, 6_000, action),
  info: (msg: string, action?: ToastAction) => push('info', msg, 4_000, action),
  // PRD §UX — longer-lived toast for undo affordance (status changes etc.).
  undo: (msg: string, action: ToastAction) => push('info', msg, 7_000, action),
};

const KIND_STYLE: Record<ToastKind, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: 'var(--success-bg, #d4f5e0)', border: 'var(--success-deep, #16794a)', color: 'var(--success-deep, #16794a)', icon: '✓' },
  error: { bg: 'var(--error-bg, #fde0e0)', border: 'var(--error-deep, #b3261e)', color: 'var(--error-deep, #b3261e)', icon: '✕' },
  info: { bg: 'var(--brand-glow-sm)', border: 'var(--brand-text)', color: 'var(--brand-text)', icon: 'ℹ' },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastEntry[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 360 }}
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const s = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="rounded-card px-3 py-2 shadow-lg flex items-start gap-2 pointer-events-auto"
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: s.color,
              animation: 'toast-in 0.2s ease-out',
            }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1, marginTop: 1 }}>{s.icon}</span>
            <span className="text-body flex-1">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  entries = entries.filter((e) => e.id !== t.id);
                  notify();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: s.color,
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 13,
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        );
      })}
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
