/**
 * §8.2 Əmək Haqqı — admin sees all, user sees own only (RLS enforced).
 * salaries table (migration 0010): employee_id, amount, currency, effective_from/to, components.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { useSalaries } from '@/lib/hooks';
import { formatAZN, formatDate } from '@/lib/format';

type Salary = {
  id: string;
  employee_id: string;
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  components: Record<string, number>;
};

type Profile = { id: string; full_name: string | null; email: string };

export function SalaryPage() {
  const { isAdmin, profile } = useAuth();
  const list = useSalaries();
  const profiles = useQuery({
    queryKey: ['profiles', 'simple'],
    enabled: isAdmin,
    queryFn: async () =>
      ((await supabase.from('profiles').select('id, full_name, email').eq('is_active', true)).data ?? []) as Profile[],
  });
  const [showForm, setShowForm] = useState(false);

  const items = (list.data ?? []) as Salary[];
  const ppl = profiles.data ?? [];
  const nameOf = (id: string) =>
    ppl.find((p) => p.id === id)?.full_name ?? ppl.find((p) => p.id === id)?.email ?? id.slice(0, 6);

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title="Əmək Haqqı"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
              + Maaş cədvəli
            </button>
          ) : null
        }
      />
      {showForm && isAdmin ? <SalaryForm ppl={ppl} onDone={() => setShowForm(false)} /> : null}
      {items.length === 0 ? (
        <EmptyState
          title="Maaş cədvəli yoxdur"
          body={
            isAdmin
              ? 'Heyətə maaş təyin et — RLS ilə yalnız sahibi və admin görəcək.'
              : `${profile?.full_name ?? ''} maaş cədvəli admin tərəfindən doldurulacaq.`
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {(isAdmin
                  ? ['İşçi', 'Məbləğ', 'Valyuta', 'Başlanğıc', 'Son', 'Komponentlər']
                  : ['Məbləğ', 'Valyuta', 'Başlanğıc', 'Son', 'Komponentlər']
                ).map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {isAdmin ? <td className="py-3 px-3">{nameOf(s.employee_id)}</td> : null}
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(s.amount)}
                  </td>
                  <td className="py-3 px-3">{s.currency}</td>
                  <td className="py-3 px-3">{formatDate(s.effective_from)}</td>
                  <td className="py-3 px-3">{s.effective_to ? formatDate(s.effective_to) : '— davam edir'}</td>
                  <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                    {Object.keys(s.components ?? {}).length > 0
                      ? Object.entries(s.components)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SalaryForm({ ppl, onDone }: { ppl: Profile[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AZN');
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const num = Number(amount);
      if (!employeeId) throw new Error('İşçini seçin');
      if (!Number.isFinite(num) || num <= 0) throw new Error('Məbləğ müsbət olmalıdır');
      const { error: e } = await supabase.from('salaries').insert({
        employee_id: employeeId,
        amount: num,
        currency,
        effective_from: from,
        effective_to: to || null,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salaries'] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      className="card mb-4 grid grid-cols-1 md:grid-cols-5 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
        <option value="">İşçini seç</option>
        {ppl.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.email}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Məbləğ"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input className="input" placeholder="AZN" value={currency} onChange={(e) => setCurrency(e.target.value)} />
      <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <input className="input" type="date" placeholder="Son (boş = davam)" value={to} onChange={(e) => setTo(e.target.value)} />
      {error ? (
        <div className="md:col-span-5 text-meta" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="md:col-span-5 flex gap-2">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Yarat
        </button>
        <button type="button" className="btn-outline" onClick={onDone}>
          Ləğv
        </button>
      </div>
    </form>
  );
}
