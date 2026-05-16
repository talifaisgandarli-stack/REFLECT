/**
 * REQ-FIN-02 + REQ-FIN-03: partial payment with overpayment guard.
 * The DB CHECK chk_paid_lte_amount on receivables is the final guard;
 * the UI prevents the round-trip and computes the new status locally.
 *
 * As of migration 0040, every payment is now an INSERT into
 * receivable_payments — a DB trigger updates receivables.paid_amount + status
 * automatically. This gives a full audit trail (who/when/how-much/method/note)
 * which the modal now also displays as a history list.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatAZN } from '@/lib/format';
import { useFocusTrap } from '@/lib/a11y';

type Receivable = {
  id: string;
  amount: number;
  paid_amount: number;
  status: 'open' | 'partial' | 'paid' | 'overdue';
};

type Props = { receivable: Receivable; onClose: () => void };

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card'] as const;
const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: 'Nağd',
  bank_transfer: 'Bank köçürməsi',
  card: 'Kart',
};

type PaymentEvent = {
  id: string;
  amount: number;
  paid_at: string;
  payment_method: string | null;
  note: string | null;
  recorded_by: string | null;
};

export function MarkPaidModal({ receivable, onClose }: Props) {
  const qc = useQueryClient();
  const remaining = Number(receivable.amount) - Number(receivable.paid_amount);
  const [delta, setDelta] = useState<string>(remaining.toString());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('bank_transfer');
  const [note, setNote] = useState('');

  const parsed = Number(delta.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= remaining;

  // Past payments — only present after migration 0040; gracefully handles
  // older deployments by treating an absent table as an empty list.
  const history = useQuery({
    queryKey: ['receivable_payments', receivable.id],
    queryFn: async (): Promise<PaymentEvent[]> => {
      const { data, error } = await supabase
        .from('receivable_payments')
        .select('id, amount, paid_at, payment_method, note, recorded_by')
        .eq('receivable_id', receivable.id)
        .order('paid_at', { ascending: false });
      if (error) {
        // Table may not exist yet — degrade gracefully
        console.warn('[MarkPaidModal] receivable_payments unavailable:', error.message);
        return [];
      }
      return (data ?? []) as PaymentEvent[];
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error('Məbləğ qalan borcdan çox ola bilməz');
      // Insert into receivable_payments — DB trigger updates receivables.paid_amount + status.
      const { data: sess } = await supabase.auth.getSession();
      const recorderId = sess.session?.user?.id ?? null;
      const { error } = await supabase.from('receivable_payments').insert({
        receivable_id: receivable.id,
        amount: parsed,
        payment_method: method,
        note: note.trim() || null,
        recorded_by: recorderId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin', 'receivables'] });
      qc.invalidateQueries({ queryKey: ['receivable_payments', receivable.id] });
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
      aria-label="Ödənişi qeyd et"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
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
        style={{ padding: 24, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h2 className="text-h2">Ödənişi qeyd et</h2>
        <dl
          className="mt-4 grid grid-cols-2 gap-y-2 text-meta"
          style={{ color: 'var(--text-muted)' }}
        >
          <dt>Cəmi</dt>
          <dd className="text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {formatAZN(receivable.amount)}
          </dd>
          <dt>Ödənilib</dt>
          <dd className="text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {formatAZN(receivable.paid_amount)}
          </dd>
          <dt>Qalır</dt>
          <dd
            className="text-right"
            style={{ color: 'var(--brand-text)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatAZN(remaining)}
          </dd>
        </dl>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Məbləğ (AZN)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              autoFocus
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Üsul
            </span>
            <select
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block mt-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Qeyd (könüllü)
          </span>
          <input
            type="text"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Məs: Faktura #123 — qismən ödəniş"
          />
        </label>

        {!valid && delta ? (
          <p className="text-meta mt-2" style={{ color: 'var(--error-deep)' }}>
            Məbləğ qalan borcdan ({formatAZN(remaining)}) çox ola bilməz.
          </p>
        ) : null}

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        {/* PRD §REQ-FIN-03 — payment history audit trail */}
        {(history.data ?? []).length > 0 ? (
          <div className="mt-5">
            <h3 className="text-meta mb-2" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>
              Tarixçə ({(history.data ?? []).length})
            </h3>
            <ul
              className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1"
              style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}
            >
              {(history.data ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <div className="flex-1 min-w-0">
                    <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(p.amount)}
                    </span>
                    {p.payment_method ? (
                      <span className="ml-2">
                        · {METHOD_LABEL[p.payment_method as keyof typeof METHOD_LABEL] ?? p.payment_method}
                      </span>
                    ) : null}
                    {p.note ? (
                      <span className="ml-2 truncate" title={p.note} style={{ fontStyle: 'italic' }}>
                        · {p.note}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0" style={{ fontSize: 11 }}>
                    {new Date(p.paid_at).toLocaleDateString('az-AZ', { timeZone: 'Asia/Baku' })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
          <button type="submit" className="btn-primary" disabled={!valid || save.isPending}>
            {save.isPending
              ? 'Yadda saxlanılır…'
              : `Qeyd et${parsed >= remaining ? ' (tam)' : ' (qismən)'}`}
          </button>
        </div>
      </form>
    </div>
  );
}
