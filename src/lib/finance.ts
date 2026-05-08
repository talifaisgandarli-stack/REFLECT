/**
 * Finance mutations — REQ-FIN-01 (income create), REQ-FIN-02 (overpayment),
 * REQ-FIN-03 (markPaid partial), REQ-FIN-04 (amount > 0).
 *
 * Form-layer validation here is a backstop. The DB has the final say:
 *   - incomes / expenses / outsource_items: CHECK (amount > 0)
 *   - receivables: CHECK (paid_amount <= amount)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
