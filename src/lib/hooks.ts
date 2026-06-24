import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './store';
import type {
  Client,
  ClientInteraction,
  ClientPipelineStage,
  ClientStageHistory,
  ClientSummary,
  InteractionType,
  Project,
  ProjectStage,
  ServiceType,
  Task,
  TaskStatus,
  ActivityLogEntry,
  UserPresence,
} from '@/types/db';

// ---------------- Projects ----------------
// PRD §348 — admins read the base table (financial columns incl. budget_amount);
// non-admins read projects_user_view, which omits amount columns so budget never
// reaches them over the wire. Role is part of the query key so the two payloads
// don't share a cache entry.
export function useProjects() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['projects', isAdmin ? 'admin' : 'user'],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from(isAdmin ? 'projects' : 'projects_user_view')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });
}

export function useProject(id: string | undefined) {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['project', id, isAdmin ? 'admin' : 'user'],
    enabled: !!id,
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase
        .from(isAdmin ? 'projects' : 'projects_user_view')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Project | null;
    },
  });
}

// ---------------- Tasks ----------------
export function useTasks(
  filter?: { projectId?: string; assigneeId?: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['tasks', filter],
    // B5 — caller can gate until a filter is known so we never run the
    // unfiltered (firm-wide) query while e.g. the profile is still loading.
    enabled: options?.enabled ?? true,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['done-list'] });
      qc.invalidateQueries({ queryKey: ['archive', 'tasks'] });
    },
  });
}

/** Detect the parent-with-open-children rejection from the DB trigger.
 *  The trigger (`0004_activity_triggers.sql`) raises with the prefix
 *  "task_has_open_children:" — startsWith is tighter than includes
 *  (won't match unrelated text that happens to contain the substring). */
export function isOpenChildrenError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const msg = (e as { message?: string }).message ?? '';
  return msg.startsWith('task_has_open_children');
}

// ---------------- Clients ----------------
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async (): Promise<Client[]> => {
      // PRD §462 — read via clients_view so expected_value is masked for non-admins.
      const { data, error } = await supabase
        .from('clients_view' as 'clients')
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
/**
 * Activity feed.
 * @param limit max rows
 * @param scope `'firm'` returns the firm-wide feed (admin dashboards); pass a
 *              userId string to scope to that user's own activity (REQ-DASH-02
 *              + PRD §9.1 — non-admins must not see other users' actions).
 */
export function useActivityFeed(
  limit = 50,
  scope: 'firm' | string = 'firm',
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['activity', limit, scope],
    // Caller gates this until scope is known — activity_log RLS is permissive
    // (al_select: any authenticated user), so a wrong/default scope would leak
    // firm-wide rows to a non-admin. Never run before the scope is resolved.
    enabled: options?.enabled ?? true,
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      let q = supabase
        .from('activity_log')
        .select('*, profiles!activity_log_user_id_fkey(id, full_name, avatar_url, email)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (scope !== 'firm') q = q.eq('user_id', scope);
      const { data, error } = await q;
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
  read_by?: Record<string, boolean> | null;
}

export function useRecentAnnouncements(limit = 3) {
  return useQuery({
    queryKey: ['announcements', 'recent', limit],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, category, is_featured, mirai_generated, approved, published_at, created_at, read_by')
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
  snoozed_until: string | null;
  created_at: string;
}

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: ['notifications', limit],
    // realtime subscription in src/lib/realtime.ts invalidates this key
    queryFn: async (): Promise<NotificationRow[]> => {
      const nowIso = new Date().toISOString();
      // PRD §6.4 — exclude rows whose snooze hasn't elapsed yet (column added
      // in migration 0041). Postgres treats NULL OR > now() correctly when
      // using the .or() filter below.
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

// PRD §6.4 — snooze a notification for N hours (writes snoozed_until = now + N*3600s)
export function useSnoozeNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; hours: number }) => {
      const until = new Date(Date.now() + input.hours * 3600 * 1000).toISOString();
      const { error } = await supabase
        .from('notifications')
        .update({ snoozed_until: until })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// PRD §6.4 — delete all already-read notifications to keep the panel tidy.
// Only own rows are deletable (RLS); we don't pass a user filter — the policy
// enforces it server-side.
export function useDeleteReadNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .not('read_at', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// PRD §6.4 — clear all active snoozes (notifications reappear immediately)
export function useClearSnoozes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ snoozed_until: null })
        .not('snoozed_until', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
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
    // REQ-PRESENCE-01 — no polling; realtime.ts subscribes to `user_presence`
    // and invalidates ['presence'] on every change (§10.5.1: updates ≤2s).
    queryFn: async (): Promise<UserPresence[]> => {
      const [presenceRes, profilesRes] = await Promise.all([
        supabase
          .from('user_presence')
          .select('*, profiles!user_presence_user_id_fkey(id, full_name, avatar_url)'),
        supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
      ]);
      if (presenceRes.error) throw presenceRes.error;

      const byId = new Map<string, UserPresence>();
      for (const r of (presenceRes.data ?? []) as UserPresence[]) byId.set(r.user_id, r);
      // REQ-DASH-06 — the panel must show ALL team members. Synthesize an
      // offline entry for active members who have never sent a heartbeat (no
      // user_presence row); empty last_heartbeat_at → UI shows "Oflayn" with
      // no fake "last seen".
      for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
        if (byId.has(p.id)) continue;
        byId.set(p.id, {
          user_id: p.id,
          status: 'offline',
          last_heartbeat_at: '',
          current_page: null,
          session_type: 'desktop',
          profiles: { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url },
        });
      }

      // REQ-PRESENCE — panel ordering: online → away → offline, then by name.
      const PRIORITY: Record<string, number> = { online: 0, away: 1, offline: 2 };
      return [...byId.values()].sort((a, b) => {
        const d = (PRIORITY[a.status] ?? 3) - (PRIORITY[b.status] ?? 3);
        if (d !== 0) return d;
        return (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? '', 'az');
      });
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

// REQ-PRESENCE-05 — classify the session's device so the presence panel can
// surface the mobile (📱) indicator. Prefer the Client Hints `mobile` boolean
// (Chromium); fall back to a UA-string test for other engines. Device class is
// fixed for the session, so this is computed once per heartbeat mount.
function detectSessionType(): 'desktop' | 'mobile' {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof nav.userAgentData?.mobile === 'boolean') {
    return nav.userAgentData.mobile ? 'mobile' : 'desktop';
  }
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|BlackBerry/i.test(navigator.userAgent)
    ? 'mobile'
    : 'desktop';
}

// REQ-PRESENCE-05 — stable per-tab session id so the backend can track each
// device/session separately and collapse them to "highest priority wins".
// sessionStorage keeps it stable across reloads within a tab, unique per tab.
function getPresenceSessionId(): string {
  try {
    let id = sessionStorage.getItem('reflect.presence-session');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('reflect.presence-session', id);
    }
    return id;
  } catch {
    return 'default';
  }
}

export function usePresenceHeartbeat(userId: string | undefined) {
  const lastActivityRef = useRef(Date.now());
  const tabFocusedRef = useRef(true);
  const statusRef = useRef<'online' | 'away'>('online');

  useEffect(() => {
    if (!userId) return;

    const sessionType = detectSessionType();
    const sessionId = getPresenceSessionId();
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
          session_type: sessionType,
          session_id: sessionId,
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
          body: JSON.stringify({ status: 'offline', current_page: null, session_type: sessionType, session_id: sessionId }),
        }).catch(() => {});
      });
    };
  }, [userId]);
}

// ──────────────── CRM redesign — project pipeline (migration 0075) ───────────
// Pipeline lives on the project. These surfaces are admin/BD-gated (the
// /müştərilər route is admin-only), so reads hit the base `projects` table and
// embed the owning client for the card badge.

export interface ProjectWithClient extends Project {
  clients: Pick<Client, 'id' | 'name' | 'company' | 'tier' | 'last_interaction_at'> | null;
}

/** All non-archived projects + their client, for the kanban + client base. */
export function usePipelineProjects() {
  return useQuery({
    queryKey: ['pipeline-projects'],
    queryFn: async (): Promise<ProjectWithClient[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, clients(id,name,company,tier,last_interaction_at)')
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectWithClient[];
    },
  });
}

/** Per-client aggregate rows for the card grid (client_summary view). */
export function useClientSummary() {
  return useQuery({
    queryKey: ['client-summary'],
    queryFn: async (): Promise<ClientSummary[]> => {
      const { data, error } = await supabase
        .from('client_summary' as 'clients')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientSummary[];
    },
  });
}

/** Every project for one client (all stages), for the detail modal. */
export function useClientProjects(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-projects', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', clientId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });
}

// Mutate a project and optimistically patch the pipeline cache so the board /
// card grid update instantly; on error we roll back and React Query refetch
// reconciles with the server. Used for drag (stage), inline value/progress edits.
function patchPipelineCache(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<Project>,
) {
  qc.setQueryData<ProjectWithClient[]>(['pipeline-projects'], (old) =>
    old?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  );
}

export function useUpdateProjectStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; stage: ProjectStage }) => {
      const { error } = await supabase
        .from('projects')
        .update({ stage: input.stage })
        .eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['pipeline-projects'] });
      const prev = qc.getQueryData<ProjectWithClient[]>(['pipeline-projects']);
      patchPipelineCache(qc, input.id, { stage: input.stage });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pipeline-projects'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-projects'] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
    },
  });
}

type ProjectEditable = Pick<
  Project,
  'value' | 'progress' | 'service_type' | 'region' | 'name' | 'expected_close_at' | 'owner_id'
>;

export function useUpdateProjectField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<ProjectEditable> }) => {
      const { error } = await supabase
        .from('projects')
        .update(input.patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['pipeline-projects'] });
      const prev = qc.getQueryData<ProjectWithClient[]>(['pipeline-projects']);
      patchPipelineCache(qc, input.id, input.patch);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pipeline-projects'], ctx.prev);
    },
    onSettled: (_d, _e, input) => {
      qc.invalidateQueries({ queryKey: ['pipeline-projects'] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
      qc.invalidateQueries({ queryKey: ['client-projects'] });
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      name: string;
      stage?: ProjectStage;
      service_type?: ServiceType | null;
      value?: number;
    }): Promise<Project> => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      const { data, error } = await supabase
        .from('projects')
        .insert({
          client_id: input.client_id,
          name: input.name,
          stage: input.stage ?? 'lead',
          service_type: input.service_type ?? null,
          value: input.value ?? 0,
          owner_id: uid,
          created_by: uid,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['pipeline-projects'] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
      qc.invalidateQueries({ queryKey: ['client-projects', vars.client_id] });
    },
  });
}
