/**
 * Realtime sync — PRD §3.4. Subscribes to Supabase channels and invalidates
 * the React Query cache when relevant rows change. Replaces our 30s polling
 * for notifications and gives presence-like immediacy on the kanban.
 *
 * Channels:
 *  - notifications:user=<uid> (per-user filter)
 *  - tasks (RLS-filtered server-side)
 *  - activity_log (RLS-filtered server-side)
 *  - announcements (read by everyone authenticated)
 *
 * Tables must be in the `supabase_realtime` publication (migration 0008).
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

type ChangeKind = 'INSERT' | 'UPDATE' | 'DELETE';

type ChangeHandler = (payload: { eventType: ChangeKind; new: unknown; old: unknown }) => void;

function subscribeTable(opts: {
  table: string;
  filter?: string;
  channelName: string;
  onChange: ChangeHandler;
}) {
  const ch = supabase
    .channel(opts.channelName)
    .on(
      // postgres_changes is the documented event name; cast keeps the
      // typed client happy when it lags Supabase's runtime catalogue.
      'postgres_changes' as unknown as 'broadcast',
      {
        event: '*',
        schema: 'public',
        table: opts.table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      } as never,
      (payload: { eventType: ChangeKind; new: unknown; old: unknown }) => {
        opts.onChange(payload);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

export function useRealtimeSync(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const cleanups: Array<() => void> = [];

    cleanups.push(
      subscribeTable({
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
        channelName: `notifications:${userId}`,
        onChange: () => {
          qc.invalidateQueries({ queryKey: ['notifications'] });
        },
      }),
    );

    cleanups.push(
      subscribeTable({
        table: 'tasks',
        channelName: 'tasks:all',
        onChange: () => {
          qc.invalidateQueries({ queryKey: ['tasks'] });
          qc.invalidateQueries({ queryKey: ['done-list'] });
          qc.invalidateQueries({ queryKey: ['archive', 'tasks'] });
        },
      }),
    );

    cleanups.push(
      subscribeTable({
        table: 'activity_log',
        channelName: 'activity:all',
        onChange: () => {
          qc.invalidateQueries({ queryKey: ['activity'] });
        },
      }),
    );

    cleanups.push(
      subscribeTable({
        table: 'announcements',
        channelName: 'announcements:all',
        onChange: () => {
          qc.invalidateQueries({ queryKey: ['announcements'] });
        },
      }),
    );

    // mirai_messages is in the realtime publication (migration 0008).
    // RLS limits the rows the user actually receives to their own
    // conversations, so an unfiltered subscribe is safe.
    cleanups.push(
      subscribeTable({
        table: 'mirai_messages',
        channelName: `mirai_messages:${userId}`,
        onChange: () => {
          qc.invalidateQueries({ queryKey: ['mirai-history'] });
        },
      }),
    );

    // task_comments — added to the realtime publication in 0023.
    // Invalidates both the task-detail comment thread and the Cmd+K
    // drawer's preview so a new comment shows up live in either
    // surface (slice 134, follow-up to 121 + 132).
    cleanups.push(
      subscribeTable({
        table: 'task_comments',
        channelName: 'task_comments:all',
        onChange: () => {
          qc.invalidateQueries({ queryKey: ['task-comments'] });
          qc.invalidateQueries({ queryKey: ['cmdk-task-comments'] });
        },
      }),
    );

    return () => {
      for (const c of cleanups) c();
    };
  }, [userId, qc]);
}
