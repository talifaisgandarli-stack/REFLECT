/**
 * REQ-FIN-01 (+ Gəlir) and the parallel + Xərc form. Validates locally
 * (positive amount per REQ-FIN-04, required fields) before insert; the
 * DB CHECK constraint `amount > 0` is the final guard.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useFocusTrap } from '@/lib/a11y';
import { PAYMENT_KIND_ORDER, PAYMENT_KIND_LABEL, type PaymentKind } from '@/lib/labels';

export type FinanceKind = 'income' | 'expense';

const PAYMENT_METHODS = ['Bank köçürməsi', 'Nağd', 'Kart', 'Digər'] as const;
const EXPENSE_CATEGORIES = [
  'Ofis kirayəsi',
  'Kommunal',
  'Maaş',
  'Outsource',
  'Marketinq',
  'Texnika',
  'Səfər',
  'Digər',
] as const;

// Existing row for edit mode — a saved income or expense opened for changes.
// Field names mirror the DB columns; unused ones per kind stay undefined.
export type FinanceEditRow = {
  id: string;
  amount: number;
  occurred_at: string;
  payment_method?: string | null;
  payment_kind?: 'advance' | 'interim' | 'final' | null;
  category?: string | null;
  vendor?: string | null;
  invoice_number?: string | null;
  note?: string | null;
  project_id: string | null;
  client_id?: string | null;
};

type Props = {
  kind: FinanceKind;
  onClose: () => void;
  defaultProjectId?: string;
  // Relabel the income form (e.g. "Ödəniş" on the project surface, where money
  // comes in as installments of a contract rather than generic "Gəlir").
  incomeNoun?: string;
  // Edit mode: prefill from this row and UPDATE it instead of inserting.
  editRow?: FinanceEditRow;
};

export function IncomeExpenseModal({ kind, onClose, defaultProjectId, incomeNoun = 'Gəlir', editRow }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const projects = useQuery({
    queryKey: ['fin-modal', 'projects'],
    queryFn: async () =>
      (await supabase
        .from('projects')
        .select('id, name')
        .is('archived_at', null)
        .order('name'))
        .data ?? [],
  });
  const clients = useQuery({
    queryKey: ['fin-modal', 'clients'],
    queryFn: async () =>
      (await supabase.from('clients_view' as 'clients').select('id, name').order('name')).data ?? [],
    enabled: kind === 'income',
  });

  const isEdit = !!editRow;
  const [amount, setAmount] = useState(editRow ? String(editRow.amount) : '');
  const [method, setMethod] = useState<string>(editRow?.payment_method ?? PAYMENT_METHODS[0]);
  const [category, setCategory] = useState<string>(editRow?.category ?? EXPENSE_CATEGORIES[0]);
  const [vendor, setVendor] = useState(editRow?.vendor ?? '');
  const [projectId, setProjectId] = useState(editRow?.project_id ?? defaultProjectId ?? '');
  const [clientId, setClientId] = useState(editRow?.client_id ?? '');
  const [invoice, setInvoice] = useState(editRow?.invoice_number ?? '');
  const [note, setNote] = useState(editRow?.note ?? '');
  const [paymentKind, setPaymentKind] = useState<'' | PaymentKind>(editRow?.payment_kind ?? '');
  const [date, setDate] = useState(() =>
    editRow?.occurred_at ? editRow.occurred_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );

  const isIncome = kind === 'income';
  const title = isEdit ? (isIncome ? `${incomeNoun}i düzəlt` : 'Xərci düzəlt') : isIncome ? `+ ${incomeNoun}` : '+ Xərc';
  const submitLabel = isEdit ? 'Yadda saxla' : isIncome ? `${incomeNoun}i qeyd et` : 'Xərci qeyd et';

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(amount.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('Məbləğ müsbət olmalıdır');
      }
      const occurred_at = new Date(`${date}T12:00:00+04:00`).toISOString();

      if (isIncome) {
        const payload = {
          amount: n,
          payment_method: method,
          occurred_at,
          invoice_number: invoice || null,
          note: note || null,
          project_id: projectId || null,
          client_id: clientId || null,
          payment_kind: paymentKind || null,
        };
        const { error } = isEdit
          ? await supabase.from('incomes').update(payload).eq('id', editRow!.id)
          : await supabase.from('incomes').insert({ ...payload, created_by: profile?.id ?? null });
        if (error) throw error;
      } else {
        const payload = {
          amount: n,
          category,
          vendor: vendor || null,
          occurred_at,
          note: note || null,
          project_id: projectId || null,
        };
        const { error } = isEdit
          ? await supabase.from('expenses').update(payload).eq('id', editRow!.id)
          : await supabase.from('expenses').insert({ ...payload, created_by: profile?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin'] });
      // Refresh the per-project P&L (project Maliyyə tab) too.
      qc.invalidateQueries({ queryKey: ['pnl'] });
      onClose();
    },
  });

  const trapRef = useFocusTrap<HTMLFormElement>(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        ref={trapRef}
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{title}</h2>

        <div className="mt-4 space-y-3">
          <Field label="Məbləğ (AZN)" required>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              required
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarix">
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {isIncome ? (
              <Field label="Ödəniş üsulu">
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Kateqoriya">
                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label="Layihə">
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— layihəsiz —</option>
              {(projects.data ?? []).map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          {isIncome ? (
            <>
              <Field label="Müştəri">
                <select
                  className="input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">— müştərisiz —</option>
                  {(clients.data ?? []).map((c: { id: string; name: string }) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ödəniş mərhələsi">
                  <select
                    className="input"
                    value={paymentKind}
                    onChange={(e) => setPaymentKind(e.target.value as '' | PaymentKind)}
                  >
                    <option value="">— ümumi —</option>
                    {PAYMENT_KIND_ORDER.map((k) => (
                      <option key={k} value={k}>{PAYMENT_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Faktura nömrəsi">
                  <input
                    className="input"
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value)}
                    placeholder="INV-2026-001"
                  />
                </Field>
              </div>
            </>
          ) : (
            <Field label="Vendor">
              <input
                className="input"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Şirkətin adı"
              />
            </Field>
          )}

          <Field label="Qeyd">
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 72, padding: '12px 14px' }}
              placeholder="Detal, kontekst…"
            />
          </Field>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            disabled={save.isPending}
          >
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !amount}>
            {save.isPending ? 'Yadda saxlanılır…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
        {required ? <span style={{ color: 'var(--error-deep)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
