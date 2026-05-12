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

const KIND_LABEL: Record<NotificationKind | 'fallback', string> = {
  mention: 'Sənə müraciət',
  task_assigned: 'Yeni tapşırıq təyin edildi',
  task_status_changed: 'Tapşırıq statusu dəyişdi',
  task_done: 'Tapşırıq tamamlandı',
  task_cancelled: 'Tapşırıq ləğv edildi',
  deadline_reminder: 'Deadline yaxınlaşır',
  finance_alert: 'Maliyyə xəbərdarlığı',
  fallback: 'Bildiriş',
};

function labelFor(kind: string): string {
  return (KIND_LABEL as Record<string, string>)[kind] ?? KIND_LABEL.fallback;
}

function bodyFor(n: NotificationRow): string {
  const p = n.payload ?? {};
  if (typeof p.title === 'string') return p.title;
  if (typeof p.task_id === 'string') return `Tapşırıq #${p.task_id.slice(0, 8)}`;
  return '';
}

// Group consecutive same-kind unread notifications under a single header so
// "5 yeni mention" is one row instead of five. Read notifications stay flat
// to preserve audit-style chronology.
type GroupedItem =
  | { kind: 'single'; row: NotificationRow }
  | { kind: 'group'; kindLabel: string; count: number; rows: NotificationRow[] };

function groupNotifications(rows: NotificationRow[]): GroupedItem[] {
  const out: GroupedItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.read_at) {
      out.push({ kind: 'single', row });
      i++;
      continue;
    }
    // Look ahead for runs of the same unread kind within a 24h window.
    const cluster: NotificationRow[] = [row];
    let j = i + 1;
    const firstTs = new Date(row.created_at).getTime();
    while (
      j < rows.length
      && !rows[j].read_at
      && rows[j].kind === row.kind
      && firstTs - new Date(rows[j].created_at).getTime() < 24 * 3_600_000
    ) {
      cluster.push(rows[j]);
      j++;
    }
    if (cluster.length >= 3) {
      out.push({ kind: 'group', kindLabel: row.kind, count: cluster.length, rows: cluster });
    } else {
      for (const r of cluster) out.push({ kind: 'single', row: r });
    }
    i = j;
  }
  return out;
}

export function NotificationBell() {
  const { data = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = data.filter((n) => !n.read_at);
  const unreadCount = unread.length;

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
        aria-label={`Bildirişlər${unreadCount ? ` (${unreadCount} oxunmamış)` : ''}`}
        aria-expanded={open}
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
              Hamısını oxunmuş işarələ
            </button>
          </header>
          {data.length === 0 ? (
            <div className="px-4 py-8 text-center text-meta" style={{ color: 'var(--text-muted)' }}>
              Hələ bildiriş yoxdur.
            </div>
          ) : null}
          {data.length > 0 ? (
            <ul>
              {groupNotifications(data).map((item) => {
                if (item.kind === 'single') {
                  const n = item.row;
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
                        style={{ background: n.read_at ? 'var(--text-faint)' : 'var(--brand-action)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-ui font-medium" style={{ color: 'var(--text)' }}>
                          {labelFor(n.kind)}
                        </div>
                        {bodyFor(n) ? (
                          <div className="text-meta truncate" style={{ color: 'var(--text-soft)' }}>
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
                }
                // Grouped: one row representing N same-kind unreads.
                const first = item.rows[0];
                return (
                  <li
                    key={`group:${first.id}`}
                    className="px-4 py-3 flex gap-3 cursor-pointer"
                    style={{ borderBottom: '1px solid var(--line-soft)', background: 'var(--brand-mist)' }}
                    onClick={() => {
                      // Mark every notification in the cluster as read.
                      for (const r of item.rows) markRead.mutate({ id: r.id });
                    }}
                  >
                    <span
                      aria-hidden
                      className="mt-1 w-2 h-2 rounded-full shrink-0"
                      style={{ background: 'var(--brand-action)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-ui font-medium" style={{ color: 'var(--text)' }}>
                        {item.count} yeni {labelFor(item.kindLabel).toLowerCase()}
                      </div>
                      <time
                        dateTime={first.created_at}
                        className="text-tiny"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {relativeTime(first.created_at)}
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
