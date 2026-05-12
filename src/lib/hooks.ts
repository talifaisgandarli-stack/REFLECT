import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  Client,
  ClientInteraction,
  ClientPipelineStage,
  ClientStageHistory,
  InteractionType,
  Project,
  Task,
  TaskStatus,
  ActivityLogEntry,
  UserPresence,
} from '@/types/db';

// ---------------- Projects ----------------
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    enabled: !!id,
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

// ---------------- Tasks ----------------
export function useTasks(filter?: { projectId?: string; assigneeId?: string }) {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: async (): Promise<Task[]> => {
      let q = supabase.from('tasks').select('*').is('archived_at', null);
      if (filter?.projectId) q = q.eq('project_id', filter.projectId);
      if (filter?.assigneeId) q = q.contains('assignee_ids', [filter.assigneeId]);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: TaskStatus; from?: TaskStatus }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: input.status })
        .eq('id', input.id);
      if (error) throw error;
    },
    // REQ-TASK-03 — optimistic update so the kanban card moves immediately
    // instead of snapping back ~200ms after drop while the network round-trips.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const snapshots = qc.getQueriesData<unknown>({ queryKey: ['tasks'] });
      qc.setQueriesData<Task[] | undefined>({ queryKey: ['tasks'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((t) => (t.id === input.id ? { ...t, status: input.status } : t));
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback on failure.
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) qc.setQueryData(key, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['done-list'] });
      qc.invalidateQueries({ queryKey: ['archive', 'tasks'] });
    },
  });
}

/** Detect the parent-with-open-children rejection from the DB trigger. */
export function isOpenChildrenError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const msg = (e as { message?: string }).message ?? '';
  return msg.includes('task_has_open_children');
}

// ---------------- Clients ----------------
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateClientStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      to: ClientPipelineStage;
      lostReason?: string | null;
    }) => {
      const { error } = await supabase.rpc('set_client_stage', {
        p_client_id: input.id,
        p_to_stage: input.to,
        p_lost_reason: input.lostReason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-stage-history', vars.id] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function isLostReasonRequired(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const msg = (e as { message?: string }).message ?? '';
  return msg.includes('lost_reason_required');
}

export function useClientInteractions(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-interactions', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientInteraction[]> => {
      const { data, error } = await supabase
        .from('client_interactions')
        .select('*')
        .eq('client_id', clientId!)
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLogInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientId: string;
      type: InteractionType;
      note?: string;
    }) => {
      // REQ-CRM-03 — attribution: stamp logged_by so the audit trail shows
      // who recorded the interaction (BD Lead vs admin).
      const { data: sess } = await supabase.auth.getSession();
      const loggedBy = sess.session?.user.id ?? null;
      const { error } = await supabase.from('client_interactions').insert({
        client_id: input.clientId,
        type: input.type,
        note: input.note ?? null,
        logged_by: loggedBy,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['client-interactions', vars.clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useClientStageHistory(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-stage-history', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientStageHistory[]> => {
      const { data, error } = await supabase
        .from('client_stage_history')
        .select('*')
        .eq('client_id', clientId!)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------- Activity log (PRD §6.1) ----------------
export function useActivityFeed(limit = 50) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*, profiles!activity_log_user_id_fkey(id, full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ActivityLogEntry[];
    },
  });
}

// ---------------- Announcements ----------------
export interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  is_featured: boolean;
  mirai_generated: boolean;
  approved: boolean;
  published_at: string | null;
  created_at: string;
}

export function useRecentAnnouncements(limit = 3) {
  return useQuery({
    queryKey: ['announcements', 'recent', limit],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, category, is_featured, mirai_generated, approved, published_at, created_at')
        .eq('approved', true)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });
}

// ---------------- Calendar (week ahead) ----------------
export interface CalendarEventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  meet_url: string | null;
  project_id: string | null;
}

export function useUpcomingMeetings(daysAhead = 7) {
  return useQuery({
    queryKey: ['calendar', 'upcoming', daysAhead],
    queryFn: async (): Promise<CalendarEventRow[]> => {
      const now = new Date();
      const horizon = new Date(now.getTime() + daysAhead * 86_400_000);
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, starts_at, ends_at, all_day, location, meet_url, project_id')
        .gte('starts_at', now.toISOString())
        .lte('starts_at', horizon.toISOString())
        .order('starts_at', { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as CalendarEventRow[];
    },
  });
}

// ---------------- Notifications (PRD §6.4) ----------------
export type NotificationKind =
  | 'mention'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_done'
  | 'task_cancelled'
  | 'deadline_reminder'
  | 'finance_alert';

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: NotificationKind | string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: ['notifications', limit],
    // realtime subscription in src/lib/realtime.ts invalidates this key
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; all?: boolean }) => {
      if (input.all) {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .is('read_at', null);
        if (error) throw error;
        return;
      }
      if (!input.id) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ---------------- Presence ----------------
export function useTeamPresence() {
  return useQuery({
    queryKey: ['presence'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<UserPresence[]> => {
      const { data, error } = await supabase
        .from('user_presence')
        .select('*, profiles!user_presence_user_id_fkey(id, full_name, avatar_url)');
      if (error) throw error;
      return (data ?? []) as UserPresence[];
    },
  });
}

/**
 * REQ-PRESENCE-02 — heartbeat every 30s; marks away on inactivity ≥5min or
 * tab blur ≥3min. Reads current route to populate REQ-PRESENCE-03 page label.
 */
const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/layihelər': 'Layihələrdə',
  '/tapşırıqlar': 'Tapşırıqlarda',
  '/müştərilər': 'Müştərilərdə',
  '/maliyyə': 'Maliyyədə',
  '/arxiv': 'Arxivdə',
  '/podrat': 'Podratda',
  '/mirai': 'MIRAI-da',
  '/komanda/heyət': 'Komandada',
  '/komanda/maaş': 'Maaşda',
  '/komanda/performans': 'Performansda',
  '/komanda/məzuniyyət': 'Məzuniyyətdə',
  '/komanda/təqvim': 'Təqvimdə',
  '/komanda/elanlar': 'Elanlarda',
  '/komanda/avadanlıq': 'Avadanlıqda',
  '/şirkət/okr': 'OKR-də',
  '/şirkət/karyera': 'Karyerada',
  '/şirkət/məzmun': 'Məzmunda',
  '/parametrlər': 'Parametrlərdə',
};

function pageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  if (pathname.startsWith('/layihelər/')) return 'Layihədə';
  if (pathname.startsWith('/parametrlər')) return 'Parametrlərdə';
  return 'Platformada';
}

export function usePresenceHeartbeat(userId: string | undefined) {
  const lastActivityRef = useRef(Date.now());
  const tabFocusedRef = useRef(true);
  const statusRef = useRef<'online' | 'away'>('online');

  useEffect(() => {
    if (!userId) return;

    const INACTIVITY_MS = 5 * 60 * 1000;
    const BLUR_MS = 3 * 60 * 1000;
    let blurAt = 0;

    function onActivity() {
      lastActivityRef.current = Date.now();
      if (statusRef.current === 'away') statusRef.current = 'online';
    }
    function onFocus() {
      tabFocusedRef.current = true;
      blurAt = 0;
      onActivity();
    }
    function onBlur() {
      tabFocusedRef.current = false;
      blurAt = Date.now();
    }

    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    async function beat() {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const now = Date.now();
      const inactive = now - lastActivityRef.current > INACTIVITY_MS;
      const blurred = !tabFocusedRef.current && blurAt > 0 && now - blurAt > BLUR_MS;
      const derived: 'online' | 'away' = inactive || blurred ? 'away' : 'online';
      statusRef.current = derived;

      const pathname = window.location.pathname;
      fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: derived,
          current_page: pageLabel(pathname),
          session_type: 'desktop',
        }),
      }).catch(() => {});
    }

    beat();
    const id = window.setInterval(beat, 30_000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);

      // Mark offline on unmount (tab close / logout)
      supabase.auth.getSession().then(({ data: s }) => {
        const token = s.session?.access_token;
        if (!token) return;
        fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'offline', current_page: null, session_type: 'desktop' }),
        }).catch(() => {});
      });
    };
  }, [userId]);
}
