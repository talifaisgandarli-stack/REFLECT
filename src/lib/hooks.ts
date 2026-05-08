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
  Announcement,
  CalendarEvent,
  MiraiFeedPost,
  CareerLevel,
  ContentPlan,
  ContentStatus,
  DayLog,
  NotificationChannel,
  NotificationPreference,
  DocumentSource,
  Equipment,
  EquipmentTransfer,
  ProjectDocument,
  CloseoutChecklist,
  CloseoutItem,
  PortfolioApplicationItem,
  PortfolioApplications,
  PortfolioWorkflow,
  SystemAward,
  KeyResult,
  LeaveKind,
  LeaveRequest,
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

// REQ-TASK-09: standard expertise subtask titles, in order.
export const EXPERTISE_SUBTASKS = [
  'Çertyoj hazırlığı',
  'Spesifikasiya yazılması',
  'Möhür + imza',
  'Çap + ciltləmə',
  'Ekspertizaya təhvil',
] as const;

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      project_id?: string | null;
      is_expertise_subtask?: boolean;
      expertise_children?: string[];
      assignee_ids?: string[];
      start_date?: string | null;
      deadline?: string | null;
      estimated_duration?: number | null;
      duration_unit?: 'hour' | 'day' | 'week' | null;
      risk_buffer_pct?: number;
      description?: string | null;
    }) => {
      const { data: parent, error: pErr } = await supabase
        .from('tasks')
        .insert({
          title: input.title,
          project_id: input.project_id ?? null,
          is_expertise_subtask: !!input.is_expertise_subtask,
          assignee_ids: input.assignee_ids ?? [],
          start_date: input.start_date ?? null,
          deadline: input.deadline ?? null,
          estimated_duration: input.estimated_duration ?? null,
          duration_unit: input.duration_unit ?? null,
          risk_buffer_pct: input.risk_buffer_pct ?? 0,
          description: input.description ?? null,
          status: 'queued',
          task_level: 0,
        })
        .select('id')
        .single();
      if (pErr) throw pErr;
      const parentId = (parent as { id: string }).id;

      const children = (input.expertise_children ?? []).filter(Boolean);
      if (children.length > 0) {
        const rows = children.map((title) => ({
          title,
          project_id: input.project_id ?? null,
          parent_task_id: parentId,
          is_expertise_subtask: true,
          task_level: 1,
          status: 'queued',
          assignee_ids: input.assignee_ids ?? [],
        }));
        const { error: cErr } = await supabase.from('tasks').insert(rows);
        if (cErr) throw cErr;
      }
      return parentId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
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

// ---------------- Closeout (REQ-PROJ-04 / US-PROJ-03) ----------------
export const DEFAULT_CLOSEOUT_ITEMS: CloseoutItem[] = [
  { key: 'akt', label: 'Akt imzalandı', checked: false },
  { key: 'final_docs', label: 'Final sənədlər təhvil verildi', checked: false },
  { key: 'archive', label: 'Layihə arxivlənib', checked: false },
  { key: 'portfolio', label: 'Portfeldə yeri var', checked: false },
  { key: 'survey', label: 'Retrospektiv sorğu göndərilib', checked: false },
];

export function useCloseoutChecklist(projectId: string | undefined) {
  return useQuery({
    queryKey: ['closeout', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<CloseoutChecklist | null> => {
      const { data, error } = await supabase
        .from('closeout_checklists')
        .select('*')
        .eq('project_id', projectId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as CloseoutChecklist | null;
    },
  });
}

export function useReopenProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.rpc('reopen_project', { p_project_id: projectId });
      if (error) throw error;
    },
    onSuccess: (_d, projectId) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useCloseProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; items: CloseoutItem[] }) => {
      const { error } = await supabase.rpc('close_project', {
        p_project_id: input.projectId,
        p_items: input.items as unknown as Record<string, unknown>,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['project', vars.projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['closeout', vars.projectId] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------- Portfolio / awards (REQ-PROJ-05 / US-PROJ-04) ----------------
// Default per-award checklist (decision logged in commit message — PRD doesn't
// specify the items, only that one exists per award).
export const DEFAULT_AWARD_CHECKLIST: PortfolioApplicationItem[] = [
  { key: 'desc_en', label: 'İngilis dilində təsvir', checked: false },
  { key: 'photos', label: 'Foto sessiyası', checked: false },
  { key: 'author_form', label: 'Müəllif anketi', checked: false },
  { key: 'fee', label: 'Ödəniş tamamlandı', checked: false },
];

export function useSystemAwards() {
  return useQuery({
    queryKey: ['system-awards'],
    queryFn: async (): Promise<SystemAward[]> => {
      const { data, error } = await supabase
        .from('system_awards')
        .select('*')
        .order('deadline_month', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SystemAward[];
    },
  });
}

export function usePortfolio(projectId: string | undefined) {
  return useQuery({
    queryKey: ['portfolio', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<PortfolioWorkflow | null> => {
      const { data, error } = await supabase
        .from('portfolio_workflows')
        .select('*')
        .eq('project_id', projectId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PortfolioWorkflow | null;
    },
  });
}

export function useUpdatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      selected_awards: string[];
      applications: PortfolioApplications;
    }) => {
      const { error } = await supabase
        .from('portfolio_workflows')
        .update({
          selected_awards: input.selected_awards,
          applications: input.applications,
        })
        .eq('project_id', input.projectId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['portfolio', vars.projectId] }),
  });
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

// ---------------- Invoice generator (US-FIN-08) ----------------
export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project_id?: string | null;
      client_id?: string | null;
      title?: string;
      category?: string;
    }): Promise<{ document_id: string; invoice_number: string; share_token: string }> => {
      const { data, error } = await supabase.rpc('generate_invoice', {
        p_project_id: input.project_id ?? null,
        p_client_id: input.client_id ?? null,
        p_title: input.title ?? null,
        p_category: input.category ?? 'Faktura',
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { document_id: string; invoice_number: string; share_token: string };
    },
    onSuccess: (_d, vars) => {
      if (vars.project_id) {
        qc.invalidateQueries({ queryKey: ['project-documents', vars.project_id] });
      }
    },
  });
}

// ---------------- Project documents (PRD §3.2 / REQ-PROJ-03) ----------------
export const DOCUMENT_CATEGORIES = [
  'Müqavilə',
  'Akt',
  'Faktura',
  'Çertyoj',
  'Spesifikasiya',
  'Foto',
  'Sorğu',
  'price_protocol',
  'Digər',
] as const;

export function useProjectDocuments(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-documents', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectDocument[]> => {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectDocument[];
    },
  });
}

export function useCreateProjectDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project_id?: string | null;
      client_id?: string | null;
      category: string;
      title: string;
      source: DocumentSource;
      external_link?: string | null;
      storage_path?: string | null;
    }) => {
      const { error } = await supabase.from('project_documents').insert({
        project_id: input.project_id ?? null,
        client_id: input.client_id ?? null,
        category: input.category,
        title: input.title,
        source: input.source,
        external_link: input.external_link ?? null,
        storage_path: input.storage_path ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['project-documents', vars.project_id ?? null] });
    },
  });
}

export function useDeleteProjectDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; projectId?: string | null }) => {
      const { error } = await supabase.from('project_documents').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['project-documents', vars.projectId ?? null] }),
  });
}

// ---------------- Equipment (US-EQUIP-01) ----------------
export function useEquipment() {
  return useQuery({
    queryKey: ['equipment'],
    queryFn: async (): Promise<Equipment[]> => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Equipment[];
    },
  });
}

export function useEquipmentTransfers(equipmentId: string | undefined) {
  return useQuery({
    queryKey: ['equipment-transfers', equipmentId],
    enabled: !!equipmentId,
    queryFn: async (): Promise<EquipmentTransfer[]> => {
      const { data, error } = await supabase
        .from('equipment_transfers')
        .select('*')
        .eq('equipment_id', equipmentId!)
        .order('transferred_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EquipmentTransfer[];
    },
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      kind?: string | null;
      serial?: string | null;
      condition?: string | null;
      purchased_at?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from('equipment').insert({
        name: input.name,
        kind: input.kind ?? null,
        serial: input.serial ?? null,
        condition: input.condition ?? null,
        purchased_at: input.purchased_at ?? null,
        notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment'] }),
  });
}

export function useAssignEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; toUserId: string | null; note?: string }) => {
      const { error } = await supabase.rpc('assign_equipment', {
        p_equipment_id: input.id,
        p_to_user_id: input.toUserId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
      qc.invalidateQueries({ queryKey: ['equipment-transfers', vars.id] });
    },
  });
}

// ---------------- MIRAI firm-wide usage (admin, PRD §7.6 / §7.9) ----------------
export interface MiraiUsageRow {
  user_id: string;
  full_name: string | null;
  email: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

export function useMiraiUsageThisMonth() {
  return useQuery({
    queryKey: ['mirai-usage-firm'],
    queryFn: async (): Promise<MiraiUsageRow[]> => {
      const now = new Date();
      const yyyymm = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1);
      const { data, error } = await supabase
        .from('mirai_usage_log')
        .select('user_id, cost_usd, tokens_in, tokens_out, profiles!inner(full_name, email)')
        .eq('period_yyyymm', yyyymm);
      if (error) throw error;
      type Row = {
        user_id: string;
        cost_usd: number;
        tokens_in: number;
        tokens_out: number;
        profiles: { full_name: string | null; email: string };
      };
      return (data ?? []).map((r) => ({
        user_id: (r as Row).user_id,
        full_name: (r as Row).profiles.full_name,
        email: (r as Row).profiles.email,
        cost_usd: Number((r as Row).cost_usd),
        tokens_in: (r as Row).tokens_in,
        tokens_out: (r as Row).tokens_out,
      }));
    },
  });
}

// ---------------- Notification preferences (US-SYS-03 / §6.4) ----------------
export const NOTIFICATION_EVENTS = [
  { key: 'deadline', label: 'Tapşırıq deadline' },
  { key: 'mention', label: '@mention' },
  { key: 'status_change', label: 'Status dəyişməsi' },
  { key: 'finance_alert', label: 'Maliyyə xəbərdarlıqları' },
  { key: 'mirai_feed', label: 'MIRAI elan feed-i' },
  { key: 'okr_nudge', label: 'OKR yenilənmə xatırlatması' },
  { key: 'leave_decision', label: 'Məzuniyyət qərarı' },
  { key: 'performance_review', label: 'Performans baxışı' },
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]['key'];

// Default channels per event when no row exists yet.
export const NOTIFICATION_DEFAULTS: Record<NotificationEventKey, Record<NotificationChannel, boolean>> = {
  deadline: { in_app: true, email: false, telegram: true },
  mention: { in_app: true, email: false, telegram: true },
  status_change: { in_app: true, email: false, telegram: false },
  finance_alert: { in_app: true, email: true, telegram: true },
  mirai_feed: { in_app: true, email: false, telegram: false },
  okr_nudge: { in_app: true, email: false, telegram: false },
  leave_decision: { in_app: true, email: false, telegram: true },
  performance_review: { in_app: true, email: false, telegram: false },
};

export function useNotificationPreferences(userId: string | undefined) {
  return useQuery({
    queryKey: ['notification-prefs', userId],
    enabled: !!userId,
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId!);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationPreference[];
    },
  });
}

export function useSetNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      channel: NotificationChannel;
      event_kind: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: input.user_id,
            channel: input.channel,
            event_kind: input.event_kind,
            enabled: input.enabled,
          },
          { onConflict: 'user_id,channel,event_kind' },
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['notification-prefs', vars.user_id] }),
  });
}

// ---------------- Day logs / timesheet (§11.1 / §12.1) ----------------
export function useDayLogs(input: { employeeId?: string; from: string; to: string }) {
  return useQuery({
    queryKey: ['day-logs', input.employeeId ?? 'all', input.from, input.to],
    queryFn: async (): Promise<DayLog[]> => {
      let q = supabase
        .from('day_logs')
        .select('*')
        .gte('day', input.from)
        .lte('day', input.to)
        .order('day', { ascending: false });
      if (input.employeeId) q = q.eq('employee_id', input.employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DayLog[];
    },
  });
}

export function useUpsertDayLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      day: string;
      hours: number;
      project_id?: string | null;
      note?: string | null;
    }) => {
      const { error } = await supabase
        .from('day_logs')
        .upsert(
          {
            employee_id: input.employee_id,
            day: input.day,
            hours: input.hours,
            project_id: input.project_id ?? null,
            note: input.note ?? null,
          },
          { onConflict: 'employee_id,day' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day-logs'] }),
  });
}

export function useDeleteDayLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('day_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day-logs'] }),
  });
}

// ---------------- Content plans (US-CONTENT-01) ----------------
export const CONTENT_CHANNELS = [
  'Instagram',
  'LinkedIn',
  'Behance',
  'ArchDaily',
  'Veb sayt',
] as const;

export function useContentPlans() {
  return useQuery({
    queryKey: ['content-plans'],
    queryFn: async (): Promise<ContentPlan[]> => {
      const { data, error } = await supabase
        .from('content_plans')
        .select('*')
        .order('scheduled_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContentPlan[];
    },
  });
}

export function useCreateContentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      channel: string;
      topic: string;
      scheduled_at?: string | null;
      owner_id?: string | null;
      status?: ContentStatus;
      body?: string | null;
    }) => {
      const { error } = await supabase.from('content_plans').insert({
        channel: input.channel,
        topic: input.topic,
        scheduled_at: input.scheduled_at ?? null,
        owner_id: input.owner_id ?? null,
        status: input.status ?? 'draft',
        body: input.body ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-plans'] }),
  });
}

export function useUpdateContentPlanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: ContentStatus }) => {
      const { error } = await supabase
        .from('content_plans')
        .update({ status: input.status })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-plans'] }),
  });
}

export function useDeleteContentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('content_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-plans'] }),
  });
}

// ---------------- MIRAI feed moderation (US-ELAN-02) ----------------
export function useFeedQueue() {
  return useQuery({
    queryKey: ['mirai-feed-queue'],
    queryFn: async (): Promise<MiraiFeedPost[]> => {
      const { data, error } = await supabase
        .from('mirai_feed_posts')
        .select('*')
        .is('posted_announcement_id', null)
        .order('fetched_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as MiraiFeedPost[];
    },
  });
}

export function useApproveFeedPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('approve_feed_post', { p_post_id: postId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mirai-feed-queue'] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

export function useRejectFeedPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from('mirai_feed_posts').delete().eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mirai-feed-queue'] }),
  });
}

// ---------------- Announcements (US-ELAN-01..03) ----------------
export const ANNOUNCEMENT_CATEGORIES = [
  'Xəbər',
  'Hadisə',
  'Trend',
  'Opportunity',
  'Siyasət',
  'Layihə',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('approved', true)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Announcement[];
    },
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body: string;
      category: AnnouncementCategory;
      cover_url?: string | null;
      is_featured?: boolean;
    }) => {
      const { error } = await supabase.from('announcements').insert({
        title: input.title,
        body: input.body,
        category: input.category,
        cover_url: input.cover_url ?? null,
        is_featured: input.is_featured ?? false,
        mirai_generated: false,
        approved: true,
        published_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; userId: string; readBy: Record<string, boolean> }) => {
      if (input.readBy[input.userId]) return;
      const next = { ...input.readBy, [input.userId]: true };
      const { error } = await supabase
        .from('announcements')
        .update({ read_by: next })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

// ---------------- Calendar (US-CAL-01..03) ----------------
export function useCalendarEvents(range?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['calendar-events', range],
    queryFn: async (): Promise<CalendarEvent[]> => {
      let q = supabase
        .from('calendar_events')
        .select('*')
        .order('starts_at', { ascending: true });
      if (range) q = q.gte('starts_at', range.start).lt('starts_at', range.end);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as CalendarEvent[];
    },
  });
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      starts_at: string;
      ends_at: string;
      all_day?: boolean;
      location?: string | null;
      meet_url?: string | null;
      description?: string | null;
      recurrence_rule?: string | null;
      attendees?: string[];
      external_emails?: string[];
      project_id?: string | null;
    }) => {
      const { error } = await supabase.from('calendar_events').insert({
        title: input.title,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        all_day: input.all_day ?? false,
        location: input.location ?? null,
        meet_url: input.meet_url ?? null,
        description: input.description ?? null,
        recurrence_rule: input.recurrence_rule ?? null,
        attendees: input.attendees ?? [],
        external_emails: input.external_emails ?? [],
        project_id: input.project_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendar_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });
}

// ---------------- Leave (US-LEAVE-01..02) ----------------
export function useLeaveRequests(employeeId?: string) {
  return useQuery({
    queryKey: ['leave', employeeId ?? 'all'],
    queryFn: async (): Promise<LeaveRequest[]> => {
      let q = supabase
        .from('leave_requests')
        .select('*')
        .order('starts_at', { ascending: false });
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LeaveRequest[];
    },
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      kind: LeaveKind;
      starts_at: string;
      ends_at: string;
      days: number;
      note?: string | null;
    }) => {
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: input.employee_id,
        kind: input.kind,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        days: input.days,
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });
}

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: 'approved' | 'denied' }) => {
      const { error } = await supabase.rpc('decide_leave', {
        p_request_id: input.id,
        p_decision: input.decision,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });
}

// ---------------- Career metrics (US-CAREER-01 auto-eval) ----------------
export interface CareerMetrics {
  closed_projects: number;
  completed_tasks: number;
}

export function useMyCareerMetrics(userId: string | undefined) {
  return useQuery({
    queryKey: ['career-metrics', userId],
    enabled: !!userId,
    queryFn: async (): Promise<CareerMetrics> => {
      const [{ count: closed }, { count: done }] = await Promise.all([
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'closed')
          .eq('created_by', userId!),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'done')
          .contains('assignee_ids', [userId!]),
      ]);
      return {
        closed_projects: closed ?? 0,
        completed_tasks: done ?? 0,
      };
    },
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

export function useUpsertCareerLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      level_index: number;
      requirements: { label: string }[];
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from('career_levels')
          .update({
            name: input.name,
            level_index: input.level_index,
            requirements: input.requirements,
          })
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('career_levels').insert({
          name: input.name,
          level_index: input.level_index,
          requirements: input.requirements,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['career-levels'] }),
  });
}

export function useDeleteCareerLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('career_levels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['career-levels'] }),
  });
}

export function useSetUserCareerLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; levelId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ career_level_id: input.levelId })
        .eq('id', input.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-profiles'] });
      qc.invalidateQueries({ queryKey: ['profiles'] });
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
