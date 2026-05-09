/**
 * ARIA-live toast renderer (slice 146).
 *
 * Subscribes to the slice 146 toast store and renders the queue in a
 * fixed-position list below the bell. role="status" + aria-live so
 * screen readers announce toasts as they arrive.
 *
 * Tones map to the semantic state tokens introduced in slice 105 —
 * info uses brand-mist, success uses brand-action-soft, error uses
 * state-error-soft. Click to dismiss; auto-dismiss is handled by the
 * store's setTimeout chain.
 */
import { useEffect, useState } from 'react';
import { dismissToast, subscribe, type Toast, type ToastTone } from '@/lib/toast';

const TONE_STYLE: Record<ToastTone, { bg: string; fg: string; border: string }> = {
  info: {
    bg: 'var(--brand-mist)',
    fg: 'var(--brand-text)',
    border: 'var(--brand-soft)',
  },
  success: {
    bg: 'var(--state-success-soft)',
    fg: 'var(--state-success)',
    border: 'var(--state-success)',
  },
  error: {
    bg: 'var(--state-error-soft)',
    fg: 'var(--state-error)',
    border: 'var(--state-error)',
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed z-50 flex flex-col gap-2"
      style={{
        bottom: 16,
        right: 16,
        maxWidth: 'calc(100vw - 32px)',
        width: 360,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const tone = TONE_STYLE[t.tone];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className="text-body text-left rounded-card"
            style={{
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
              padding: '12px 14px',
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 4px 12px rgba(14,22,17,0.08)',
            }}
          >
            {t.message}
          </button>
        );
      })}
    </div>
  );
}
