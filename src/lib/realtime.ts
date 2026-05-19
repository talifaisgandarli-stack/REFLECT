/**
 * Realtime sync — PRD §3.4. Subscribes to Supabase channels and invalidates
 * the React Query cache when relevant rows change.
 *
 * Scoping strategy:
 *  - notifications: filter=user_id=eq.<uid> (per-user push)
 *  - tasks/activity/announcements: RLS already filters server-side so a user
 *    only receives events for rows they can SELECT. We further coalesce
 *    invalidations via debounce so a burst of related events triggers a
 *    single refetch — the original audit concern (100× refetch overhead).
 *
 * Tables must be in the `supabase_realtime` publication (migration 0008).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { announce } from './a11y';

type ChangeKind = 'INSERT' | 'UPDATE' | 'DELETE';

type ChangeHandler = (payload: { eventType: ChangeKind; new: unknown; old: unknown }) => void;

function subscribeTable(opts: {
  table: string;
  filter?: string;
  channelName: string;
  onChange: ChangeHandler;
}) {
  // postgres_changes is the documented event name; cast keeps the typed
  // client happy when it lags Supabase's runtime catalogue.
  const ch = (supabase.channel(opts.channelName) as unknown as {
    on: (event: string, filter: Record<string, unknown>, cb: ChangeHandler) => { subscribe: () => unknown };
  })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: opts.table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      },
      (payload) => opts.onChange(payload),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch as never);
  };
}

// Coalesce bursts of invalidations into one — e.g. drag-drop emits an UPDATE
// event AND its dependent task_status_history INSERT in the same tick.
function makeDebouncer(qc: QueryClient): (key: readonly unknown[]) => void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  return (key) => {
    const k = JSON.stringify(key);
    const existing = pending.get(k);
    if (existing) clearTimeout(existing);
    pending.set(
      k,
      setTimeout(() => {
        pending.delete(k);
        qc.invalidateQueries({ queryKey: key as readonly never[] });
      }, 150),
    );
  };
}

export function useRealtimeSync(userId: string | undefined) {
  const qc = useQueryClient();
  const debouncerRef = useRef<((key: readonly unknown[]) => void) | null>(null);
  if (!debouncerRef.current) debouncerRef.current = makeDebouncer(qc);
  const debouncedInvalidate = debouncerRef.current;

  useEffect(() => {
    if (!userId) return;

    const cleanups: Array<() => void> = [];

    cleanups.push(
      subscribeTable({
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
        channelName: `notifications:${userId}`,
        onChange: (payload) => {
          debouncedInvalidate(['notifications']);
          // Announce new notifications for screen readers.
          if (payload.eventType === 'INSERT') {
            announce('Yeni bildiriş');
          }
        },
      }),
    );

    // RLS scopes the events server-side: a user only receives changes to
    // tasks they can SELECT. Channel name includes userId so Supabase routes
    // separately per session — avoids the broadcast fan-out cost.
    //
    // PRD §3.4 — DELETE race fix: with optimistic DnD (useUpdateTaskStatus),
    // a mid-flight mutation can resurrect a deleted task via its onError
    // rollback. We eagerly prune the deleted id from every ['tasks'] cache
    // slice on DELETE so the rollback snapshot taken AFTER this point is
    // already clean. The debounced invalidation still runs as a backstop.
    cleanups.push(
      subscribeTable({
        table: 'tasks',
        channelName: `tasks:${userId}`,
        onChange: (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string } | null;
            const deletedId = oldRow?.id;
            if (deletedId) {
              for (const [key, value] of qc.getQueriesData<unknown>({ queryKey: ['tasks'] })) {
                if (!Array.isArray(value)) continue;
                qc.setQueryData(
                  key,
                  (value as Array<{ id: string }>).filter((t) => t.id !== deletedId),
                );
              }
            }
          }
          debouncedInvalidate(['tasks']);
          debouncedInvalidate(['done-list']);
          debouncedInvalidate(['archive', 'tasks']);
          if (payload.eventType === 'UPDATE') {
            announce('Tapşırıq yeniləndi');
          } else if (payload.eventType === 'INSERT') {
            announce('Yeni tapşırıq əlavə edildi');
          } else if (payload.eventType === 'DELETE') {
            announce('Tapşırıq silindi');
          }
        },
      }),
    );

    cleanups.push(
      subscribeTable({
        table: 'activity_log',
        channelName: `activity:${userId}`,
        onChange: () => debouncedInvalidate(['activity']),
      }),
    );

    // PRD §3.4 — task_comments live sync so collaborative comment editing
    // doesn't go stale. Invalidates any open task_comments query key; the
    // TaskCommentsModal hook uses ['task_comments', taskId] so this is broad
    // by design (cheap when modal isn't open).
    cleanups.push(
      subscribeTable({
        table: 'task_comments',
        channelName: `task_comments:${userId}`,
        onChange: () => debouncedInvalidate(['task_comments']),
      }),
    );

    cleanups.push(
      subscribeTable({
        table: 'announcements',
        channelName: `announcements:${userId}`,
        onChange: (payload) => {
          debouncedInvalidate(['announcements']);
          if (payload.eventType === 'INSERT') {
            announce('Yeni elan');
          }
        },
      }),
    );

    return () => {
      for (const c of cleanups) c();
    };
  }, [userId, debouncedInvalidate]);
}
