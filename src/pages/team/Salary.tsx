/**
 * Əmək Haqqı (PRD §M8.2). Admin sees full table + can add new rows;
 * non-admin sees only their own salary history (RLS enforces this; the
 * UI mirrors the boundary for clarity).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { useT } from '@/lib/i18n';
import { formatAZN, formatDate } from '@/lib/format';

type SalaryRow = {
  id: string;
  employee_id: string;
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  components: Record<string, unknown>;
  created_at: string;
};

export function SalaryPage() {
  const t = useT();
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const salaries = useQuery({
    queryKey: ['salaries', isAdmin ? 'all' : profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('salaries')
        .select('*')
        .order('effective_from', { ascending: false });
      if (!isAdmin && profile?.id) q = q.eq('employee_id', profile.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
  });

  const profiles = useQuery({
    queryKey: ['salaries', 'profiles'],
    enabled: isAdmin,
    queryFn: async () =>
      (
        await supabase
          .from('profiles')
          .select('id, full_name, email')
          .order('full_name')
      ).data ?? [],
  });

  const profileMap = new Map<string, { full_name: string | null; email: string }>();
  for (const p of (profiles.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string;
  }>) {
    profileMap.set(p.id, p);
  }

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title={t('nav.team.salary')}
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Maaş cədvəli
            </button>
          ) : null
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {[...(isAdmin ? ['İşçi'] : []), 'Məbləğ', 'Etibarlı', 'Bitiş', 'Yaradılıb'].map(
                (h) => (
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
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {(salaries.data ?? []).map((s) => {
              const p = profileMap.get(s.employee_id);
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {isAdmin ? (
                    <td className="py-3 px-3">
                      {p?.full_name ?? p?.email ?? s.employee_id.slice(0, 8)}
                    </td>
                  ) : null}
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(s.amount)}
                  </td>
                  <td className="py-3 px-3">{formatDate(s.effective_from)}</td>
                  <td className="py-3 px-3">{s.effective_to ? formatDate(s.effective_to) : '—'}</td>
                  <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(s.created_at)}
                  </td>
                </tr>
              );
            })}
            {(salaries.data ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={isAdmin ? 5 : 4}
                  className="py-6 text-center text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Maaş cədvəli yoxdur.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating && isAdmin ? (
        <SalaryModal
          profiles={
            (profiles.data ?? []) as Array<{
              id: string;
              full_name: string | null;
              email: string;
            }>
          }
          onClose={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['salaries'] });
          }}
        />
      ) : null}
    </>
  );
}

function SalaryModal({
  profiles,
  onClose,
}: {
  profiles: Array<{ id: string; full_name: string | null; email: string }>;
  onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('İşçi seçin');
      const n = Number(amount.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) throw new Error('Məbləğ müsbət olmalıdır');
      const { error } = await supabase.from('salaries').insert({
        employee_id: employeeId,
        amount: n,
        currency: 'AZN',
        effective_from: from,
        effective_to: to || null,
      });
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni maaş cədvəli"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
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
        <h2 className="text-h2">+ Maaş cədvəli</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              İşçi
            </span>
            <select
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">— seçin —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Məbləğ (AZN)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Etibarlı
              </span>
              <input
                type="date"
                className="input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Bitiş (ix.)
              </span>
              <input
                type="date"
                className="input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
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
          <button
            type="submit"
            className="btn-primary"
            disabled={save.isPending || !employeeId || !amount}
          >
            {save.isPending ? 'Yadda saxlanılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
