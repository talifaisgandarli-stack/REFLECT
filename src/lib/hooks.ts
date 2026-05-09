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
      // task_status_history is also written by the DB trigger (0004); keeping
      // this insert as a no-op fallback when triggers are not yet deployed.
    },
    onSuccess: () => {
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
      const { error } = await supabase.from('client_interactions').insert({
        client_id: input.clientId,
        type: input.type,
        note: input.note ?? null,
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

// ---------------- Activity log (Realtime in v1.5) ----------------
export function useActivityFeed(limit = 50) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
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
  | 'finance_alert'
  | 'calendar_event_rsvp';

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
      const { data, error } = await supabase.from('user_presence').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}
