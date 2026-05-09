/**
 * Bildiriş bell — PRD §6.4 inapp channel surface.
 * Shows unread count badge; click opens a small panel of recent items.
 * Items are rendered in AZ; payload-driven labels stay generic so new
 * notification kinds can ship without UI changes.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type NotificationKind,
  type NotificationRow,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { collapse } from '@/lib/notificationGroup';

const KIND_KEY: Record<NotificationKind | 'fallback', string> = {
  mention: 'notif.kind.mention',
  task_assigned: 'notif.kind.task_assigned',
  task_status_changed: 'notif.kind.task_status_changed',
  task_done: 'notif.kind.task_done',
  task_cancelled: 'notif.kind.task_cancelled',
  deadline_reminder: 'notif.kind.deadline_reminder',
  finance_alert: 'notif.kind.finance_alert',
  fallback: 'notif.kind.mention', // unused; useT() falls back to the key itself
};

function bodyFor(n: NotificationRow): string {
  const p = n.payload ?? {};
  if (typeof p.title === 'string') return p.title;
  if (typeof p.task_id === 'string') return `Tapşırıq #${p.task_id.slice(0, 8)}`;
  return '';
}

export function NotificationBell() {
  const t = useT();
  const { data = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function labelFor(kind: string): string {
    const k = (KIND_KEY as Record<string, string>)[kind];
    return k ? t(k) : kind;
  }

  const unread = data.filter((n) => !n.read_at);
  const unreadCount = unread.length;
  const groups = collapse(data);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClick);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn-ghost relative"
        aria-label={
          unreadCount > 0 ? t('notif.bell.unread', { count: unreadCount }) : 'Bildirişlər'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full text-tiny font-medium flex items-center justify-center"
            style={{
              background: 'var(--brand-action)',
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Bildirişlər"
          className="absolute right-0 mt-2 w-[360px] max-w-[92vw] rounded-card z-40"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 8px 24px rgba(14,22,17,0.12)',
            maxHeight: '70vh',
            overflow: 'auto',
          }}
        >
          <header
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--line-soft)' }}
          >
            <span className="text-h4">Bildirişlər</span>
            <button
              type="button"
              className="text-meta hover:underline disabled:opacity-50"
              style={{ color: 'var(--brand-text)' }}
              onClick={() => markRead.mutate({ all: true })}
              disabled={unreadCount === 0 || markRead.isPending}
            >
              {t('notif.bell.mark_all')}
            </button>
          </header>
          {data.length === 0 ? (
            <div className="px-4 py-8 text-center text-meta" style={{ color: 'var(--text-muted)' }}>
              {t('notif.empty')}
            </div>
          ) : null}
          {data.length > 0 ? (
            <ul>
              {groups.map((g) => {
                if (g.kind === 'group') {
                  const { leader, rows } = g;
                  return (
                    <li
                      key={`g-${leader.id}`}
                      className="px-4 py-3 flex gap-3 cursor-pointer"
                      style={{
                        borderBottom: '1px solid var(--line-soft)',
                        background: 'var(--brand-mist)',
                      }}
                      onClick={() => {
                        for (const r of rows) markRead.mutate({ id: r.id });
                      }}
                    >
                      <span
                        aria-hidden
                        className="mt-1 w-2 h-2 rounded-full shrink-0"
                        style={{ background: 'var(--brand-action)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-ui font-medium"
                          style={{ color: 'var(--text)' }}
                        >
                          {labelFor(leader.kind)} · {rows.length}
                        </div>
                        <time
                          dateTime={leader.created_at}
                          className="text-tiny"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {relativeTime(leader.created_at)}
                        </time>
                      </div>
                    </li>
                  );
                }
                const n = g.row;
                return (
                  <li
                    key={n.id}
                    className="px-4 py-3 flex gap-3 cursor-pointer"
                    style={{
                      borderBottom: '1px solid var(--line-soft)',
                      background: n.read_at ? 'transparent' : 'var(--brand-mist)',
                    }}
                    onClick={() => {
                      if (!n.read_at) markRead.mutate({ id: n.id });
                    }}
                  >
                    <span
                      aria-hidden
                      className="mt-1 w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: n.read_at ? 'var(--text-faint)' : 'var(--brand-action)',
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-ui font-medium"
                        style={{ color: 'var(--text)' }}
                      >
                        {labelFor(n.kind)}
                      </div>
                      {bodyFor(n) ? (
                        <div
                          className="text-meta truncate"
                          style={{ color: 'var(--text-soft)' }}
                        >
                          {bodyFor(n)}
                        </div>
                      ) : null}
                      <time
                        dateTime={n.created_at}
                        className="text-tiny"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {relativeTime(n.created_at)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <footer
            className="px-4 py-2 text-meta text-center"
            style={{ borderTop: '1px solid var(--line-soft)' }}
          >
            <Link
              to="/bildirişlər"
              onClick={() => setOpen(false)}
              style={{ color: 'var(--brand-text)' }}
            >
              Bildiriş tərcihlərini idarə et →
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 21h4" />
    </svg>
  );
}
