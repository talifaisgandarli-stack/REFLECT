/**
 * REQ-FIN-02 + REQ-FIN-03: partial payment with overpayment guard.
 * The DB CHECK chk_paid_lte_amount on receivables is the final guard;
 * the UI prevents the round-trip and computes the new status locally.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatAZN } from '@/lib/format';

type Receivable = {
  id: string;
  amount: number;
  paid_amount: number;
  status: 'open' | 'partial' | 'paid' | 'overdue';
};

type Props = { receivable: Receivable; onClose: () => void };

export function MarkPaidModal({ receivable, onClose }: Props) {
  const qc = useQueryClient();
  const remaining = Number(receivable.amount) - Number(receivable.paid_amount);
  const [delta, setDelta] = useState<string>(remaining.toString());

  const parsed = Number(delta.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= remaining;
  const newPaid = Number(receivable.paid_amount) + (Number.isFinite(parsed) ? parsed : 0);
  const newStatus: Receivable['status'] = useMemo(() => {
    if (newPaid >= Number(receivable.amount)) return 'paid';
    if (newPaid > 0) return 'partial';
    return receivable.status;
  }, [newPaid, receivable.amount, receivable.status]);

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error('Məbləğ qalan borcdan çox ola bilməz');
      const { error } = await supabase
        .from('receivables')
        .update({ paid_amount: newPaid, status: newStatus })
        .eq('id', receivable.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin', 'receivables'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label="Ödənişi qeyd et"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
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

        <label className="block mt-5">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Bu ödənişin məbləği (AZN)
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

        {!valid && delta ? (
          <p className="text-meta mt-2" style={{ color: 'var(--state-error)' }}>
            Məbləğ qalan borcdan ({formatAZN(remaining)}) çox ola bilməz.
          </p>
        ) : null}

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
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || save.isPending}>
            {save.isPending ? 'Yadda saxlanılır…' : `Qeyd et${newStatus === 'paid' ? ' (tam)' : ' (qismən)'}`}
          </button>
        </div>
      </form>
    </div>
  );
}
