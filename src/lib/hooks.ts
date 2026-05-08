import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  Client,
  ClientInteraction,
  ClientPipelineStage,
  ClientStageHistory,
  Expense,
  Income,
  InteractionType,
  OutsourceItem,
  OutsourceStatus,
  CareerLevel,
  KeyResult,
  Okr,
  OkrScope,
  PerformanceReview,
  Profile,
  ProjectPnl,
  Salary,
  Template,
  Project,
  Receivable,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
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

// ---------------- Finance (admin only — RLS enforced) ----------------
export function useIncomes(range?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['fin', 'incomes', range],
    queryFn: async (): Promise<Income[]> => {
      let q = supabase.from('incomes').select('*').order('occurred_at', { ascending: false });
      if (range) q = q.gte('occurred_at', range.start).lt('occurred_at', range.end);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExpenses(range?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['fin', 'expenses', range],
    queryFn: async (): Promise<Expense[]> => {
      let q = supabase.from('expenses').select('*').order('occurred_at', { ascending: false });
      if (range) q = q.gte('occurred_at', range.start).lt('occurred_at', range.end);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReceivables() {
  return useQuery({
    queryKey: ['fin', 'receivables'],
    queryFn: async (): Promise<Receivable[]> => {
      const { data, error } = await supabase
        .from('receivables')
        .select('*')
        .order('due_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectPnl() {
  return useQuery({
    queryKey: ['fin', 'pnl'],
    queryFn: async (): Promise<ProjectPnl[]> => {
      const { data, error } = await supabase
        .from('project_pnl' as 'projects')
        .select('*')
        .order('net', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectPnl[];
    },
  });
}

export function useOutsourceItems() {
  return useQuery({
    queryKey: ['fin', 'outsource'],
    queryFn: async (): Promise<OutsourceItem[]> => {
      const { data, error } = await supabase
        .from('outsource_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount: number;
      project_id?: string | null;
      client_id?: string | null;
      payment_method?: string | null;
      occurred_at?: string;
      invoice_number?: string | null;
      note?: string | null;
    }) => {
      if (!(input.amount > 0)) throw new Error('amount_must_be_positive');
      const { error } = await supabase.from('incomes').insert({
        amount: input.amount,
        project_id: input.project_id ?? null,
        client_id: input.client_id ?? null,
        payment_method: input.payment_method ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        invoice_number: input.invoice_number ?? null,
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin', 'incomes'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount: number;
      category?: string | null;
      vendor?: string | null;
      project_id?: string | null;
      occurred_at?: string;
      note?: string | null;
    }) => {
      if (!(input.amount > 0)) throw new Error('amount_must_be_positive');
      const { error } = await supabase.from('expenses').insert({
        amount: input.amount,
        category: input.category ?? null,
        vendor: input.vendor ?? null,
        project_id: input.project_id ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin', 'expenses'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateOutsourceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: OutsourceStatus }) => {
      const { error } = await supabase.rpc('update_outsource_status', {
        p_item_id: input.id,
        p_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin', 'outsource'] });
      qc.invalidateQueries({ queryKey: ['outsource'] });
      qc.invalidateQueries({ queryKey: ['outsource-user'] });
    },
  });
}

export function isOutsourcePaidAdminOnly(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  return ((e as { message?: string }).message ?? '').includes('paid_admin_only');
}

export function useMarkReceivablePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; delta: number }) => {
      if (!(input.delta > 0)) throw new Error('delta_must_be_positive');
      const { data, error } = await supabase.rpc('mark_receivable_paid', {
        p_receivable_id: input.id,
        p_delta: input.delta,
      });
      if (error) throw error;
      return data as Receivable | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin', 'receivables'] }),
  });
}

export function isOverpaymentError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const msg = (e as { message?: string }).message ?? '';
  return msg.includes('overpayment_blocked') || msg.includes('chk_paid_lte_amount');
}

// ---------------- Retrospective survey (REQ-CRM-07 / US-CRM-06) ----------------
export function useCreateRetrospective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<{ share_token: string }> => {
      const { data, error } = await supabase.rpc('create_retrospective', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data as { share_token: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity'] }),
  });
}

export function useSubmitPerformanceReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      year: number;
      score: number;
      ratings?: Record<string, number>;
      summary?: string | null;
    }) => {
      const { error } = await supabase.rpc('submit_performance_review', {
        p_employee_id: input.employee_id,
        p_year: input.year,
        p_score: input.score,
        p_ratings: input.ratings ?? {},
        p_summary: input.summary ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perf'] }),
  });
}

// ---------------- Career levels (US-CAREER-01) ----------------
export function useCareerLevels() {
  return useQuery({
    queryKey: ['career-levels'],
    queryFn: async (): Promise<CareerLevel[]> => {
      const { data, error } = await supabase
        .from('career_levels')
        .select('*')
        .order('level_index', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CareerLevel[];
    },
  });
}

// ---------------- OKR (REQ-DASH-02 / US-OKR-01..03) ----------------
export function useOkrs(filter?: { scope?: OkrScope; employeeId?: string }) {
  return useQuery({
    queryKey: ['okrs', filter],
    queryFn: async (): Promise<Okr[]> => {
      let q = supabase.from('okrs').select('*').order('created_at', { ascending: false });
      if (filter?.scope) q = q.eq('scope', filter.scope);
      if (filter?.employeeId) q = q.eq('employee_id', filter.employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Okr[];
    },
  });
}

export function useKeyResultsForOkrs(okrIds: string[]) {
  return useQuery({
    queryKey: ['key-results', okrIds.sort().join(',')],
    enabled: okrIds.length > 0,
    queryFn: async (): Promise<KeyResult[]> => {
      const { data, error } = await supabase
        .from('key_results')
        .select('*')
        .in('okr_id', okrIds);
      if (error) throw error;
      return (data ?? []) as unknown as KeyResult[];
    },
  });
}

export function useUpdateKeyResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; current_value: number }) => {
      const { error } = await supabase
        .from('key_results')
        .update({ current_value: input.current_value, updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['key-results'] }),
  });
}

export function useCreateOkr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scope: OkrScope;
      objective: string;
      period: string;
      employee_id?: string | null;
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('okrs')
        .insert({
          scope: input.scope,
          objective: input.objective,
          period: input.period,
          employee_id: input.employee_id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs'] }),
  });
}

export function useCreateKeyResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      okr_id: string;
      title: string;
      target_value: number;
      unit?: string | null;
    }) => {
      const { error } = await supabase.from('key_results').insert({
        okr_id: input.okr_id,
        title: input.title,
        target_value: input.target_value,
        unit: input.unit ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['key-results'] }),
  });
}

// ---------------- Active profiles (small select for admin pickers) ----------------
export function useActiveProfiles() {
  return useQuery({
    queryKey: ['active-profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Profile[];
    },
  });
}

// ---------------- Salary (US-SAL-01) ----------------
export function useSalaries(employeeId?: string) {
  return useQuery({
    queryKey: ['salaries', employeeId ?? 'all'],
    queryFn: async (): Promise<Salary[]> => {
      let q = supabase.from('salaries').select('*').order('effective_from', { ascending: false });
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Salary[];
    },
  });
}

export function useSetSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      amount: number;
      currency: string;
      effective_from: string;
      components?: Record<string, unknown>;
    }) => {
      const { error } = await supabase.rpc('set_salary', {
        p_employee_id: input.employee_id,
        p_amount: input.amount,
        p_currency: input.currency,
        p_effective_from: input.effective_from,
        p_components: input.components ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salaries'] }),
  });
}

// ---------------- Performance (US-PERF-01) ----------------
export function usePerformanceReviews(employeeId?: string) {
  return useQuery({
    queryKey: ['perf', employeeId ?? 'all'],
    queryFn: async (): Promise<PerformanceReview[]> => {
      let q = supabase
        .from('performance_reviews')
        .select('*')
        .order('year', { ascending: false });
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PerformanceReview[];
    },
  });
}

// ---------------- Templates (US-SYS-01 / §10.2) ----------------
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Template[];
    },
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      category: string;
      name: string;
      body: string;
      mime_type?: string | null;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from('templates')
          .update({
            category: input.category,
            name: input.name,
            body: input.body,
            mime_type: input.mime_type ?? null,
          })
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('templates').insert({
          category: input.category,
          name: input.name,
          body: input.body,
          mime_type: input.mime_type ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

// ---------------- Team workload (US-DASH-05 / REQ-TASK-06) ----------------
export interface TeamWorkloadRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  open_count: number;
}

export function useTeamWorkload() {
  return useQuery({
    queryKey: ['team-workload'],
    queryFn: async (): Promise<TeamWorkloadRow[]> => {
      const { data, error } = await supabase
        .from('team_workload_summary' as 'profiles')
        .select('*');
      if (error) throw error;
      return ((data ?? []) as unknown as TeamWorkloadRow[]).sort(
        (a, b) => b.open_count - a.open_count,
      );
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
