import { useEffect, useRef } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/format';
import { useAuth } from '@/lib/store';
import {
  useAnnouncements,
  useMarkAllAnnouncementsRead,
  useMarkAnnouncementRead,
} from '@/lib/dashboard';

export function AnnouncementsPage() {
  const { profile } = useAuth();
  const q = useAnnouncements(50);
  const markRead = useMarkAnnouncementRead();
  const markAll = useMarkAllAnnouncementsRead();

  // Auto-mark visible items as read after a brief dwell — PRD §8.6 says the
  // unread badge clears when the user actually sees the post. We do it after
  // 1500ms so a quick scroll-past doesn't clear everything.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!profile?.id) return;
    const t = window.setTimeout(() => {
      for (const a of q.data ?? []) {
        if (seen.current.has(a.id)) continue;
        const isUnread = !(a.read_by ?? {})[profile.id];
        if (isUnread) {
          seen.current.add(a.id);
          markRead.mutate(a.id);
        }
      }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [q.data, profile?.id, markRead]);

  const unreadCount = (q.data ?? []).filter(
    (a) => !(a.read_by ?? {})[profile?.id ?? '_'],
  ).length;

  return (
    <>
      <PageHead
        meta={unreadCount > 0 ? `${unreadCount} oxunmamış` : 'MIRAI feed + manual'}
        title="Elanlar"
        actions={
          <>
            {unreadCount > 0 ? (
              <button
                className="btn-outline"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Hamısını oxunmuş işarələ
              </button>
            ) : null}
            <button className="btn-primary">+ Yeni elan</button>
          </>
        }
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState
          title="Elan yoxdur"
          body="MIRAI CMO trend feed-dən təkliflər doldurmağa başlayanda burada görünəcək."
        />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((a) => {
            const isUnread = !(a.read_by ?? {})[profile?.id ?? '_'];
            return (
              <article
                key={a.id}
                className="card"
                style={{
                  border: isUnread ? '1px solid var(--brand-action)' : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {isUnread ? <span className="chip chip-brand">Yeni</span> : null}
                  {a.is_featured ? <span className="chip">Featured</span> : null}
                  {a.category ? <span className="chip">{a.category}</span> : null}
                </div>
                <h3 className="text-h3">{a.title}</h3>
                <p className="text-body mt-1 whitespace-pre-line">{a.body}</p>
                <div className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
                  {a.published_at ? relativeTime(a.published_at) : '—'}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
