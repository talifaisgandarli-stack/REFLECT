/**
 * Realtime + presence helpers — PRD §3.4 channels.
 *
 *   tasks:project_id=<uuid>  → status changes broadcast
 *   activity_log             → Dashboard feed
 *   announcements            → unread badge updates
 *   mirai_messages:...       → streaming surface (out of scope here)
 *
 * We use Supabase postgres_changes which already respects RLS. The channel
 * naming on the client mirrors the PRD intent; the actual filter is applied
 * at the postgres_changes level.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './store';

/** Re-fetch tasks whenever any tasks row changes. RLS handles visibility. */
export function useRealtimeTasks() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel('tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => qc.invalidateQueries({ queryKey: ['tasks'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

/** Re-fetch the activity_log feed whenever a new row lands. */
export function useRealtimeActivityLog() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel('activity_log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        () => qc.invalidateQueries({ queryKey: ['activity'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

/** Refresh announcements list / unread badge on any new announcement. */
export function useRealtimeAnnouncements() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel('announcements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => qc.invalidateQueries({ queryKey: ['announcements'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

/** Refresh the live presence panel whenever any user_presence row changes. */
export function useRealtimePresence() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel('user_presence')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        () => qc.invalidateQueries({ queryKey: ['presence'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

/**
 * REQ-PRESENCE-02 — POST /api/presence/heartbeat every 30s while the tab is
 * visible. Sends current_page from window.location.pathname. Marks 'away' on
 * tab hide, 'offline' on unload.
 */
export function usePresenceHeartbeat() {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let timer: number | null = null;

    async function send(status: 'online' | 'away' | 'offline') {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            current_page: window.location.pathname,
            status,
            session_type: 'desktop',
          }),
          keepalive: true,
        });
      } catch {
        // Heartbeat is best-effort; never surface to UI.
      }
    }

    function tick() {
      if (cancelled) return;
      send(document.hidden ? 'away' : 'online');
      timer = window.setTimeout(tick, 30_000);
    }
    function onVisibility() {
      send(document.hidden ? 'away' : 'online');
    }
    // No unload beacon: sendBeacon cannot attach the Bearer token, so the
    // endpoint would 401. "Offline" is derived server-side from staleness of
    // last_heartbeat_at instead (REQ-PRESENCE-02).

    tick();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session]);
}
