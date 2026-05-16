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
  useSnoozeNotification,
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

// PRD §6.4 — bucket a timestamp into a human-readable date section label
// (Bu gün / Dünən / Bu həftə / Əvvəl). Used to inject headers into the list.
function dateBucket(iso: string): string {
  const d = new Date(iso);
  const tz = 'Asia/Baku';
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const eventKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  if (eventKey === todayKey) return 'Bu gün';
  const yesterday = new Date(Date.now() - 86_400_000);
  const yKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(yesterday);
  if (eventKey === yKey) return 'Dünən';
  const ageDays = (Date.now() - d.getTime()) / 86_400_000;
  if (ageDays <= 7) return 'Bu həftə';
  return 'Əvvəl';
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
  const snooze = useSnoozeNotification();
  const [open, setOpen] = useState(false);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
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
              {(() => {
                // PRD §6.4 — emit date-bucket headers (Bu gün / Dünən / …)
                // interleaved with the grouped items.
                const items = groupNotifications(data);
                const out: React.ReactNode[] = [];
                let lastBucket = '';
                for (const item of items) {
                  const first = item.kind === 'single' ? item.row : item.rows[0];
                  const bucket = dateBucket(first.created_at);
                  if (bucket !== lastBucket) {
                    out.push(
                      <li
                        key={`hdr-${bucket}-${first.id}`}
                        className="px-4 pt-3 pb-1 text-meta uppercase"
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: 10,
                          letterSpacing: '0.08em',
                          background: 'var(--surface-mist)',
                          fontWeight: 600,
                        }}
                      >
                        {bucket}
                      </li>,
                    );
                    lastBucket = bucket;
                  }
                  if (item.kind === 'single') {
                  const n = item.row;
                  const isSnoozeOpen = snoozeOpenId === n.id;
                  out.push(
                    <li
                      key={n.id}
                      className="px-4 py-3 flex gap-3 cursor-pointer relative"
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
                      {/* PRD §6.4 — snooze chip (unread rows only) */}
                      {!n.read_at ? (
                        <button
                          type="button"
                          className="text-tiny opacity-50 hover:opacity-100 self-start mt-1"
                          style={{ color: 'var(--text-muted)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSnoozeOpenId(isSnoozeOpen ? null : n.id);
                          }}
                          title="Sonra xatırlat"
                        >
                          ⏰
                        </button>
                      ) : null}
                      {isSnoozeOpen ? (
                        <div
                          className="absolute top-12 right-2 rounded-card p-2 z-10 flex flex-col gap-1"
                          style={{
                            background: 'var(--ink)',
                            color: 'var(--canvas)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            minWidth: 140,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {[
                            { hours: 1, label: '1 saat' },
                            { hours: 4, label: '4 saat' },
                            { hours: 24, label: 'Sabaha qədər' },
                            { hours: 24 * 7, label: 'Bir həftə' },
                          ].map((opt) => (
                            <button
                              key={opt.hours}
                              type="button"
                              className="text-meta text-left px-2 py-1 rounded hover:bg-white/5"
                              style={{ color: 'var(--canvas)' }}
                              onClick={() => {
                                snooze.mutate({ id: n.id, hours: opt.hours });
                                setSnoozeOpenId(null);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>,
                  );
                } else {
                  // Grouped: one row representing N same-kind unreads.
                  const groupFirst = item.rows[0];
                  out.push(
                    <li
                      key={`group:${groupFirst.id}`}
                      className="px-4 py-3 flex gap-3 cursor-pointer"
                      style={{ borderBottom: '1px solid var(--line-soft)', background: 'var(--brand-mist)' }}
                      onClick={() => {
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
                          dateTime={groupFirst.created_at}
                          className="text-tiny"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {relativeTime(groupFirst.created_at)}
                        </time>
                      </div>
                    </li>,
                  );
                }
                }
                return out;
              })()}
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
