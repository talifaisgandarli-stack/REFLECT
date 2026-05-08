/**
 * Top-right notifications bell + dropdown — surfaces unread `notifications`
 * rows (PRD §3.2). The mention path from REQ-TASK-07 is the first
 * producer; finance/deadline notifications can land here too as they
 * grow.
 *
 * Realtime: useUnreadNotifications hooks Supabase Realtime on the
 * notifications table filtered by user_id.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useUnreadNotifications,
} from '@/lib/comments';
import { relativeTime } from '@/lib/format';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const all = useUnreadNotifications(20);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const nav = useNavigate();

  const unread = useMemo(
    () => (all.data ?? []).filter((n) => n.read_at == null),
    [all.data],
  );

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  function onClickItem(id: string, kind: string, payload: Record<string, unknown>) {
    markRead.mutate(id);
    if (kind === 'mention' && payload.task_id) {
      nav(`/tapşırıqlar`);
    }
    setOpen(false);
  }

  return (
    <div className="fixed top-4 right-4 z-30">
      <button
        type="button"
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: 40,
          height: 40,
          background: 'var(--surface-mist)',
          border: '1px solid var(--line-soft)',
          color: 'var(--text)',
        }}
        onClick={() => setOpen((v) => !v)}
        aria-label="Bildirişlər"
      >
        <span aria-hidden>🔔</span>
        {unread.length > 0 ? (
          <span
            className="absolute -top-1 -right-1 text-tiny px-1.5 rounded-chip"
            style={{
              background: 'var(--brand-action)',
              color: 'var(--brand-text)',
              minWidth: 18,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: '16px',
              height: 18,
            }}
          >
            {unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-[360px] card p-0 overflow-hidden"
          style={{ borderRadius: 14 }}
        >
          <div
            className="flex items-baseline justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--line-soft)' }}
          >
            <span className="text-h4">Bildirişlər</span>
            {unread.length > 0 ? (
              <button
                type="button"
                className="text-meta"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => markAll.mutate()}
              >
                Hamısını oxu
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {(all.data ?? []).length === 0 ? (
              <li
                className="px-4 py-6 text-meta text-center"
                style={{ color: 'var(--text-muted)' }}
              >
                Bildiriş yoxdur.
              </li>
            ) : (
              (all.data ?? []).map((n) => {
                const isUnread = n.read_at == null;
                const preview = String(
                  (n.payload as { preview?: unknown }).preview ?? '',
                );
                return (
                  <li
                    key={n.id}
                    style={{
                      borderBottom: '1px solid var(--line-soft)',
                      background: isUnread ? 'rgba(173,251,73,0.04)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 text-body"
                      onClick={() => onClickItem(n.id, n.kind, n.payload)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium truncate">
                          {kindLabel(n.kind)}
                        </span>
                        <span
                          className="text-meta shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {relativeTime(n.created_at)}
                        </span>
                      </div>
                      {preview ? (
                        <div
                          className="text-meta mt-1 truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {preview}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'mention':
      return 'Səni qeyd etdilər';
    case 'task_deadline':
      return 'Tapşırıq deadline-ı';
    case 'task_status_change':
      return 'Status dəyişdi';
    default:
      return kind;
  }
}
