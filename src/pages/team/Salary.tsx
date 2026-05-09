/**
 * Əmək Haqqı — PRD §8.2 / Module 8.2
 * Admin: sees all employees + can add rows.
 * User: sees own salary history only (RLS enforced at DB).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import type { Profile, Salary } from '@/types/db';

type SalaryRow = Salary & { profile?: Pick<Profile, 'id' | 'full_name' | 'email'> };

const CURRENCIES = ['AZN', 'USD', 'EUR'] as const;
type Currency = (typeof CURRENCIES)[number];

export function SalaryPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const rows = useQuery({
    queryKey: ['salaries', isAdmin],
    queryFn: async (): Promise<SalaryRow[]> => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from('salaries')
          .select('*, profile:profiles(id, full_name, email)')
          .order('effective_from', { ascending: false });
        if (error) throw error;
        return (data ?? []) as SalaryRow[];
      }
      const { data, error } = await supabase
        .from('salaries')
        .select('*')
        .eq('employee_id', profile!.id)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
    enabled: !!profile?.id,
  });

  const profiles = useQuery({
    queryKey: ['profiles-list'],
    enabled: isAdmin,
    queryFn: async (): Promise<Pick<Profile, 'id' | 'full_name' | 'email'>[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title="Əmək Haqqı"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Maaş cədvəli
            </button>
          ) : null
        }
      />

      {rows.isLoading ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Yüklənir…
        </div>
      ) : (rows.data ?? []).length === 0 ? (
        <EmptyState
          title="Maaş məlumatı yoxdur"
          body={isAdmin ? 'Heyətin maaş cədvəlini əlavə edin.' : 'Maaş tarixiniz hazırda əlçatımlı deyil.'}
          cta={isAdmin ? <button className="btn-primary" onClick={() => setShowForm(true)}>+ Maaş cədvəli</button> : undefined}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {isAdmin && (
                  <th className="text-meta text-left py-3 pr-4" style={{ color: 'var(--text-muted)' }}>
                    İşçi
                  </th>
                )}
                <th className="text-meta text-right py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Məbləğ
                </th>
                <th className="text-meta text-left py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Valyuta
                </th>
                <th className="text-meta text-left py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Başlanğıc
                </th>
                <th className="text-meta text-left py-3 pl-4" style={{ color: 'var(--text-muted)' }}>
                  Bitmə
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {isAdmin && (
                    <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text)' }}>
                      {r.profile?.full_name ?? r.profile?.email ?? r.employee_id.slice(0, 8)}
                    </td>
                  )}
                  <td
                    className="py-3 px-4 text-right font-medium"
                    style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}
                  >
                    {r.amount.toLocaleString('az-AZ')}
                  </td>
                  <td className="py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                    {r.currency}
                  </td>
                  <td className="py-3 px-4" style={{ color: 'var(--text)' }}>
                    {r.effective_from}
                  </td>
                  <td className="py-3 pl-4" style={{ color: 'var(--text-muted)' }}>
                    {r.effective_to ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && isAdmin && (
        <AddSalaryModal
          profiles={profiles.data ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['salaries'] });
            setShowForm(false);
          }}
        />
      )}
    </>
  );
}

type AddProps = {
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'>[];
  onClose: () => void;
  onSaved: () => void;
};

function AddSalaryModal({ profiles, onClose, onSaved }: AddProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('AZN');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!employeeId || !amount || !effectiveFrom) throw new Error('Zəruri sahələri doldurun');
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) throw new Error('Məbləğ müsbət rəqəm olmalıdır');
      const { error } = await supabase.from('salaries').insert({
        employee_id: employeeId,
        amount: amt,
        currency,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
      });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <div
      role="dialog"
      aria-label="Maaş əlavə et"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-h2 mb-4">Maaş cədvəli</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              İşçi <span style={{ color: '#B91C1C' }}>*</span>
            </span>
            <select
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">Seçin…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Məbləğ <span style={{ color: '#B91C1C' }}>*</span>
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Valyuta
              </span>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Başlanğıc tarixi <span style={{ color: '#B91C1C' }}>*</span>
              </span>
              <input
                type="date"
                className="input"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Bitmə tarixi
              </span>
              <input
                type="date"
                className="input"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                min={effectiveFrom || undefined}
              />
            </label>
          </div>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Yadda saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </form>
    </div>
  );
}
