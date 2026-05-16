/**
 * Time-tracking hooks (migration 0052).
 *
 * - useActiveTimeEntry()   → current user's running entry (or null)
 * - useStartTimer(taskId)  → start (cancels any other active timer)
 * - useStopTimer()         → stop the active entry
 * - useTodayTotal()        → today's total seconds tracked (per user)
 *
 * DB-level partial unique index guarantees ≤1 active per user, but we also
 * stop any prior active entry client-side to avoid 409 round-trips.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './store';

export type TimeEntry = {
  id: string;
  user_id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
};

export function useActiveTimeEntry() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['time-entry-active', profile?.id],
    enabled: !!profile?.id,
    refetchInterval: 30_000, // poll so the topbar indicator stays accurate
    queryFn: async (): Promise<TimeEntry | null> => {
      const { data } = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', profile!.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as TimeEntry | null) ?? null;
    },
  });
}

export function useStartTimer() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!profile?.id) throw new Error('Sessiya yoxdur');
      // Stop any active entry first (idempotent)
      await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .is('ended_at', null);
      const { error } = await supabase
        .from('time_entries')
        .insert({ user_id: profile.id, task_id: taskId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entry-active'] });
      qc.invalidateQueries({ queryKey: ['time-entries-today'] });
    },
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Sessiya yoxdur');
      const { error } = await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .is('ended_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entry-active'] });
      qc.invalidateQueries({ queryKey: ['time-entries-today'] });
    },
  });
}

export function useTodayTotal() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['time-entries-today', profile?.id],
    enabled: !!profile?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      // Asia/Baku midnight today → ISO
      const now = new Date();
      const bakuOffsetMin = 4 * 60; // +04:00 standard
      const local = new Date(now.getTime() + bakuOffsetMin * 60_000);
      local.setUTCHours(0, 0, 0, 0);
      const since = new Date(local.getTime() - bakuOffsetMin * 60_000).toISOString();

      const { data } = await supabase
        .from('time_entries')
        .select('duration_seconds, started_at, ended_at')
        .eq('user_id', profile!.id)
        .gte('started_at', since);
      let total = 0;
      for (const r of (data ?? []) as Array<{ duration_seconds: number | null; started_at: string; ended_at: string | null }>) {
        if (r.duration_seconds != null) total += r.duration_seconds;
        else if (!r.ended_at) total += Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000);
      }
      return total;
    },
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}s ${m}d`;
  return `${m}d`;
}
