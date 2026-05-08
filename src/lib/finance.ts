/**
 * Finance mutations — REQ-FIN-01 (income create), REQ-FIN-02 (overpayment),
 * REQ-FIN-03 (markPaid partial), REQ-FIN-04 (amount > 0).
 *
 * Form-layer validation here is a backstop. The DB has the final say:
 *   - incomes / expenses / outsource_items: CHECK (amount > 0)
 *   - receivables: CHECK (paid_amount <= amount)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export type IncomeInput = {
  amount: number;
  project_id?: string | null;
  client_id?: string | null;
  payment_method?: string | null;
  occurred_at?: string;
  invoice_number?: string | null;
  note?: string | null;
};

export type ExpenseInput = {
  amount: number;
  project_id?: string | null;
  category?: string | null;
  vendor?: string | null;
  occurred_at?: string;
  note?: string | null;
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** REQ-FIN-04 — refuse zero/negative amounts before hitting the DB. */
function assertPositiveAmount(n: number) {
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Məbləğ müsbət olmalıdır.');
  }
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IncomeInput) => {
      assertPositiveAmount(input.amount);
      const { data, error } = await supabase
        .from('incomes')
        .insert({
          amount: input.amount,
          project_id: input.project_id ?? null,
          client_id: input.client_id ?? null,
          payment_method: input.payment_method ?? null,
          occurred_at: input.occurred_at ?? new Date().toISOString(),
          invoice_number: input.invoice_number ?? null,
          note: input.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin'] });
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      assertPositiveAmount(input.amount);
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          amount: input.amount,
          project_id: input.project_id ?? null,
          category: input.category ?? null,
          vendor: input.vendor ?? null,
          occurred_at: input.occurred_at ?? new Date().toISOString(),
          note: input.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin'] });
    },
  });
}

/**
 * REQ-FIN-03 — supports partial payments (paid_amount += delta), status flips
 * only when fully paid. REQ-FIN-02 — overpayment blocked at form layer (DB
 * CHECK is the final guard).
 */
export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; delta: number }) => {
      assertPositiveAmount(input.delta);
      const { data: row, error: readErr } = await supabase
        .from('receivables')
        .select('id, amount, paid_amount')
        .eq('id', input.id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!row) throw new ValidationError('Debitor sətri tapılmadı.');

      const next = Number(row.paid_amount ?? 0) + input.delta;
      if (next > Number(row.amount)) {
        throw new ValidationError(
          `Artıq ödəniş: qalan ${Number(row.amount) - Number(row.paid_amount ?? 0)} AZN.`,
        );
      }
      const fullyPaid = next >= Number(row.amount);
      const { error: updErr } = await supabase
        .from('receivables')
        .update({
          paid_amount: next,
          status: fullyPaid ? 'paid' : 'partial',
        })
        .eq('id', input.id);
      if (updErr) throw updErr;
      return { fullyPaid, paid_amount: next };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin'] });
    },
  });
}

// ----------------------------------------------------------------------------
// REQ-FIN-06 Project P&L
// ----------------------------------------------------------------------------

export type ProjectPL = {
  project_id: string | null;
  name: string;
  income: number;
  expenses: number;
  outsource: number;
  net: number;
};

/**
 * PRD §4 marks Maliyyə Mərkəzi as admin-only, so all three child tables are
 * fetched directly with RLS doing the work. Aggregation is client-side over
 * the row count of a small studio (≤low-thousands per year). For larger
 * scales, swap this for a SQL view + RPC.
 */
export function useProjectPL() {
  return useQuery({
    queryKey: ['fin', 'pl'],
    queryFn: async (): Promise<ProjectPL[]> => {
      const [proj, inc, exp, out] = await Promise.all([
        supabase.from('projects').select('id, name').limit(500),
        supabase.from('incomes').select('project_id, amount').limit(5000),
        supabase.from('expenses').select('project_id, amount').limit(5000),
        supabase.from('outsource_items').select('project_id, amount').limit(5000),
      ]);
      const map = new Map<string | null, ProjectPL>();
      function bucket(id: string | null, name: string) {
        if (!map.has(id)) {
          map.set(id, { project_id: id, name, income: 0, expenses: 0, outsource: 0, net: 0 });
        }
        return map.get(id)!;
      }
      const projName = new Map<string, string>();
      for (const p of (proj.data ?? []) as { id: string; name: string }[]) {
        projName.set(p.id, p.name);
        bucket(p.id, p.name);
      }
      for (const r of (inc.data ?? []) as { project_id: string | null; amount: number }[]) {
        bucket(r.project_id, r.project_id ? projName.get(r.project_id) ?? '—' : 'Layihəsiz').income += Number(r.amount);
      }
      for (const r of (exp.data ?? []) as { project_id: string | null; amount: number }[]) {
        bucket(r.project_id, r.project_id ? projName.get(r.project_id) ?? '—' : 'Layihəsiz').expenses += Number(r.amount);
      }
      for (const r of (out.data ?? []) as { project_id: string | null; amount: number }[]) {
        bucket(r.project_id, r.project_id ? projName.get(r.project_id) ?? '—' : 'Layihəsiz').outsource += Number(r.amount);
      }
      const rows = Array.from(map.values()).map((r) => ({
        ...r,
        net: r.income - r.expenses - r.outsource,
      }));
      // Drop projects with zero activity to keep the view honest.
      return rows.filter((r) => r.income !== 0 || r.expenses !== 0 || r.outsource !== 0)
        .sort((a, b) => b.net - a.net);
    },
  });
}

// ----------------------------------------------------------------------------
// REQ-FIN-05 Recurring expenses
// ----------------------------------------------------------------------------

export type RecurringPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export const RECURRING_PERIOD_LABEL: Record<RecurringPeriod, string> = {
  weekly: 'Həftəlik',
  monthly: 'Aylıq',
  quarterly: 'Rüblük',
  yearly: 'İllik',
};

export function useRecurringExpenses() {
  return useQuery({
    queryKey: ['fin', 'recurring'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .order('next_run_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      label: string;
      amount: number;
      period: RecurringPeriod;
      next_run_at: string;
    }) => {
      if (!input.label.trim()) throw new ValidationError('Ad boş ola bilməz.');
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new ValidationError('Məbləğ müsbət olmalıdır.');
      }
      const { data, error } = await supabase
        .from('recurring_expenses')
        .insert({
          label: input.label.trim(),
          amount: input.amount,
          period: input.period,
          next_run_at: input.next_run_at,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin'] }),
  });
}

export function useDeleteRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin'] }),
  });
}

// ----------------------------------------------------------------------------
// REQ-FIN-07 Outsource
// ----------------------------------------------------------------------------

export type OutsourceStatus = 'order' | 'in_progress' | 'delivered' | 'paid';
export const OUTSOURCE_STATUS_LABEL: Record<OutsourceStatus, string> = {
  order: 'Sifariş',
  in_progress: 'İcra',
  delivered: 'Təhvil',
  paid: 'Ödənildi',
};
export const OUTSOURCE_STATUS_ORDER: OutsourceStatus[] = ['order', 'in_progress', 'delivered', 'paid'];

export function useOutsourceItems() {
  return useQuery({
    queryKey: ['fin', 'outsource'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outsource_items')
        .select('*')
        .order('deadline', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateOutsource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project_id?: string | null;
      work_title: string;
      contact_person?: string | null;
      contact_company?: string | null;
      amount: number;
      payment_method?: string | null;
      responsible_user_id?: string | null;
      deadline?: string | null;
    }) => {
      if (!input.work_title.trim()) throw new ValidationError('İş adı boş ola bilməz.');
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new ValidationError('Məbləğ müsbət olmalıdır.');
      }
      const { error } = await supabase.from('outsource_items').insert({
        project_id: input.project_id ?? null,
        work_title: input.work_title.trim(),
        contact_person: input.contact_person ?? null,
        contact_company: input.contact_company ?? null,
        amount: input.amount,
        payment_method: input.payment_method ?? null,
        responsible_user_id: input.responsible_user_id ?? null,
        deadline: input.deadline ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin'] }),
  });
}

export function useUpdateOutsourceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: OutsourceStatus }) => {
      const patch: { status: OutsourceStatus; paid_at?: string | null } = { status: input.status };
      if (input.status === 'paid') patch.paid_at = new Date().toISOString();
      const { error } = await supabase
        .from('outsource_items')
        .update(patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin'] }),
  });
}
