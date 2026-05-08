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
