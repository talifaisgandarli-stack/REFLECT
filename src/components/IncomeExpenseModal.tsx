/**
 * REQ-FIN-01 (+ Gəlir) and the parallel + Xərc form. Validates locally
 * (positive amount per REQ-FIN-04, required fields) before insert; the
 * DB CHECK constraint `amount > 0` is the final guard.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useT } from '@/lib/i18n';

export type FinanceKind = 'income' | 'expense';

const PAYMENT_METHODS = [
  { value: 'Bank köçürməsi', labelKey: 'finance.method.bank_transfer' },
  { value: 'Nağd', labelKey: 'finance.method.cash' },
  { value: 'Kart', labelKey: 'finance.method.card' },
  { value: 'Digər', labelKey: 'finance.method.other' },
] as const;
const EXPENSE_CATEGORIES = [
  { value: 'Ofis kirayəsi', labelKey: 'finance.category.rent' },
  { value: 'Kommunal', labelKey: 'finance.category.utilities' },
  { value: 'Maaş', labelKey: 'finance.category.salary' },
  { value: 'Outsource', labelKey: 'finance.category.outsource' },
  { value: 'Marketinq', labelKey: 'finance.category.marketing' },
  { value: 'Texnika', labelKey: 'finance.category.equipment' },
  { value: 'Səfər', labelKey: 'finance.category.travel' },
  { value: 'Digər', labelKey: 'finance.category.other' },
] as const;

type Props = { kind: FinanceKind; onClose: () => void };

export function IncomeExpenseModal({ kind, onClose }: Props) {
  const t = useT();
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
      (await supabase.from('clients').select('id, name').order('name')).data ?? [],
    enabled: kind === 'income',
  });

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0].value);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [vendor, setVendor] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isIncome = kind === 'income';
  const title = isIncome ? t('finance.income.add') : t('finance.expense.add');
  const submitLabel = isIncome
    ? t('finance.modal.submit_income')
    : t('finance.modal.submit_expense');

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(amount.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(t('finance.modal.amount_invalid'));
      }
      const occurred_at = new Date(`${date}T12:00:00+04:00`).toISOString();

      if (isIncome) {
        const { error } = await supabase.from('incomes').insert({
          amount: n,
          payment_method: method,
          occurred_at,
          invoice_number: invoice || null,
          note: note || null,
          project_id: projectId || null,
          client_id: clientId || null,
          created_by: profile?.id ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert({
          amount: n,
          category,
          vendor: vendor || null,
          occurred_at,
          note: note || null,
          project_id: projectId || null,
          created_by: profile?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
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
          <Field label={t('finance.modal.amount')} required>
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
            <Field label={t('finance.modal.date')}>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {isIncome ? (
              <Field label={t('finance.modal.payment_method')}>
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label={t('finance.modal.category')}>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label={t('finance.modal.project')}>
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{t('finance.modal.project_none')}</option>
              {(projects.data ?? []).map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          {isIncome ? (
            <>
              <Field label={t('finance.modal.client')}>
                <select
                  className="input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">{t('finance.modal.client_none')}</option>
                  {(clients.data ?? []).map((c: { id: string; name: string }) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('finance.modal.invoice')}>
                <input
                  className="input"
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  placeholder="INV-2026-001"
                />
              </Field>
            </>
          ) : (
            <Field label={t('finance.modal.vendor')}>
              <input
                className="input"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder={t('finance.modal.vendor_placeholder')}
              />
            </Field>
          )}

          <Field label={t('finance.modal.note')}>
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 72, padding: '12px 14px' }}
              placeholder={t('finance.modal.note_placeholder')}
            />
          </Field>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
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
            {t('common.back')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !amount}>
            {save.isPending ? t('finance.modal.saving') : submitLabel}
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
        {required ? <span style={{ color: 'var(--state-error)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
