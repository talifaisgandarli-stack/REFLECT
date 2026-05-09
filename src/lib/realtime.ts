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
  // The Supabase JS client overloads `.on()` per channel kind; the
  // postgres_changes overload is real at runtime but the TS overload
  // signatures are narrow. We bypass the typed wrapper via `any` here —
  // confined to this single helper to keep the typed surface clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = supabase.channel(opts.channelName) as any;
  const ch = channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: opts.table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      },
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

    return () => {
      for (const c of cleanups) c();
    };
  }, [userId, qc]);
}
