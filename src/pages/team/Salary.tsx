/**
 * Salary list + add — PRD §8.2.
 *   Admin sees all rows; user sees own only (RLS auth.uid() = employee_id, migration 0017).
 *   Admin can insert new salary rows; users cannot.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { formatAZN, formatDate } from '@/lib/format';
import type { Profile } from '@/types/db';

type SalaryRow = {
  id: string;
  employee_id: string;
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  components: Record<string, unknown>;
};

export function SalaryPage() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const profilesQ = useQuery({
    queryKey: ['profiles', 'minimal'],
    enabled: isAdmin,
    queryFn: async () =>
      ((
        await supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      ).data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[],
  });

  const salaries = useQuery({
    queryKey: ['salaries'],
    queryFn: async () =>
      ((
        await supabase
          .from('salaries')
          .select('*')
          .order('effective_from', { ascending: false })
          .limit(500)
      ).data ?? []) as SalaryRow[],
  });

  const profileMap = new Map(
    (profilesQ.data ?? []).map((p) => [p.id, p.full_name ?? p.email]),
  );

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title="Əmək Haqqı"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + Maaş əlavə et
            </button>
          ) : null
        }
      />

      {(salaries.data ?? []).length === 0 ? (
        <EmptyState
          title="Maaş qeydi yoxdur"
          body={isAdmin ? 'Heyət üçün maaş cədvəli daxil et.' : 'Hələ sizə maaş təyin edilməyib.'}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {[
                  ...(isAdmin ? ['İşçi'] : []),
                  'Məbləğ',
                  'Valyuta',
                  'Başlama',
                  'Bitmə',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(salaries.data ?? []).map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {isAdmin ? (
                    <td className="py-3 px-3">{profileMap.get(s.employee_id) ?? '—'}</td>
                  ) : null}
                  <td
                    className="py-3 px-3"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatAZN(s.amount)}
                  </td>
                  <td className="py-3 px-3">{s.currency}</td>
                  <td className="py-3 px-3">{formatDate(s.effective_from)}</td>
                  <td className="py-3 px-3">
                    {s.effective_to ? formatDate(s.effective_to) : 'davam edir'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <SalaryAddModal
          profiles={profilesQ.data ?? []}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function SalaryAddModal({
  profiles,
  onClose,
}: {
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'>[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AZN');
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('salaries').insert({
        employee_id: employeeId,
        amount: Number(amount),
        currency,
        effective_from: effectiveFrom,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salaries'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-md w-full space-y-3">
        <h3 className="text-h3">Maaş əlavə et</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            İşçi
          </span>
          <select
            className="input mt-1 w-full"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">— seç —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Məbləğ
          </span>
          <input
            type="number"
            className="input mt-1 w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={0}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Valyuta
            </span>
            <input
              className="input mt-1 w-full"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Başlama
            </span>
            <input
              type="date"
              className="input mt-1 w-full"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!employeeId || !amount || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
