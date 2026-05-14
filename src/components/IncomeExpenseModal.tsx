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

type Props = { kind: FinanceKind; onClose: () => void };

export function IncomeExpenseModal({ kind, onClose }: Props) {
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
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [vendor, setVendor] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isIncome = kind === 'income';
  const title = isIncome ? '+ Gəlir' : '+ Xərc';
  const submitLabel = isIncome ? 'Gəliri qeyd et' : 'Xərci qeyd et';

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(amount.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('Məbləğ müsbət olmalıdır');
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
              <Field label="Faktura nömrəsi">
                <input
                  className="input"
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  placeholder="INV-2026-001"
                />
              </Field>
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
