/**
 * Project P&L — REQ-FIN-06.
 *
 * Per-project income, direct expenses, outsource costs, net.
 * Admin-only surface (parent gates with isAdmin); each underlying table
 * has admin-only RLS so a non-admin call returns empty rows anyway.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatAZN } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

type Props = { projectId: string };

type Row = { amount: number; occurred_at?: string | null; paid_at?: string | null };

export function ProjectPnL({ projectId }: Props) {
  const incomes = useQuery({
    queryKey: ['pnl', 'incomes', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incomes')
        .select('amount, occurred_at')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const expenses = useQuery({
    queryKey: ['pnl', 'expenses', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, occurred_at, category')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data ?? []) as Array<Row & { category: string | null }>;
    },
  });
  const outsource = useQuery({
    queryKey: ['pnl', 'outsource', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outsource_items')
        .select('amount, paid_at, status')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data ?? []) as Array<Row & { status: string }>;
    },
  });

  const incomeTotal = sum(incomes.data ?? []);
  const expenseTotal = sum(expenses.data ?? []);
  const outsourceCommitted = sum(outsource.data ?? []);
  const outsourcePaid = sum(
    (outsource.data ?? []).filter((r) => r.paid_at) as Row[],
  );
  const direct = expenseTotal + outsourcePaid;
  const net = incomeTotal - direct;
  const netCommitted = incomeTotal - expenseTotal - outsourceCommitted;

  const monthly = useMemo(() => {
    const map = new Map<string, { m: string; in: number; out: number; outsource: number }>();
    function bucket(iso: string | null | undefined): string | null {
      return iso ? iso.slice(0, 7) : null;
    }
    function ensure(k: string) {
      if (!map.has(k)) map.set(k, { m: k, in: 0, out: 0, outsource: 0 });
      return map.get(k)!;
    }
    for (const r of incomes.data ?? []) {
      const k = bucket(r.occurred_at);
      if (k) ensure(k).in += Number(r.amount ?? 0);
    }
    for (const r of expenses.data ?? []) {
      const k = bucket(r.occurred_at);
      if (k) ensure(k).out += Number(r.amount ?? 0);
    }
    for (const r of outsource.data ?? []) {
      const k = bucket(r.paid_at);
      if (k) ensure(k).outsource += Number(r.amount ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => a.m.localeCompare(b.m));
  }, [incomes.data, expenses.data, outsource.data]);

  function exportCsv() {
    const rows: Array<Array<unknown>> = [];
    rows.push(['Cəmi', 'Layihə gəliri', incomeTotal]);
    rows.push(['Cəmi', 'Birbaşa xərc', direct]);
    rows.push(['Cəmi', 'Outsource (öhdəlik)', outsourceCommitted]);
    rows.push(['Cəmi', 'Xalis', net]);
    rows.push(['Cəmi', 'Xalis (öhdəliklə)', netCommitted]);
    for (const m of monthly) {
      rows.push([`Aylıq · ${m.m}`, 'Gəlir', m.in]);
      rows.push([`Aylıq · ${m.m}`, 'Xərc', m.out]);
      rows.push([`Aylıq · ${m.m}`, 'Outsource ödənilib', m.outsource]);
    }
    downloadCsv(`reflect-pnl-${projectId.slice(0, 8)}`, ['Bölmə', 'Açar', 'AZN'], rows);
  }

  const loading = incomes.isLoading || expenses.isLoading || outsource.isLoading;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Layihə gəliri" value={formatAZN(incomeTotal)} accent />
        <Stat label="Birbaşa xərc" value={formatAZN(direct)} />
        <Stat
          label="Xalis"
          value={formatAZN(net)}
          tone={net >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {monthly.length > 0 ? (
        <div className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-h3">Aylıq cash flow</h3>
            <button type="button" className="btn-outline" onClick={exportCsv}>
              CSV
            </button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid stroke="rgba(122,133,127,0.2)" vertical={false} />
              <XAxis dataKey="m" stroke="#7A857F" />
              <YAxis stroke="#7A857F" />
              <Tooltip
                formatter={(value: number, name: string) => [formatAZN(value), name]}
                cursor={{ fill: 'rgba(173,251,73,0.06)' }}
              />
              <Legend />
              <Bar dataKey="in" name="Gəlir" fill="#ADFB49" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name="Xərc" fill="#1A5140" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="outsource"
                name="Outsource"
                fill="#5CA87C"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="card">
        <h3 className="text-h3 mb-3">Detallı bölgü</h3>
        {loading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yüklənir…
          </p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Maddə', 'Sayğac', 'Məbləğ'].map((h) => (
                  <th
                    key={h}
                    className="text-meta text-left py-2 px-3"
                    style={{
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PnLRow label="Gəlir" count={incomes.data?.length ?? 0} amount={incomeTotal} />
              <PnLRow
                label="Xərc (operativ)"
                count={expenses.data?.length ?? 0}
                amount={expenseTotal}
                negative
              />
              <PnLRow
                label="Outsource (ödənilib)"
                count={(outsource.data ?? []).filter((r) => r.paid_at).length}
                amount={outsourcePaid}
                negative
              />
              <PnLRow
                label="Outsource (öhdəlik)"
                count={outsource.data?.length ?? 0}
                amount={outsourceCommitted}
                muted
              />
              <tr style={{ borderTop: '2px solid var(--line)' }}>
                <td className="py-3 px-3 font-medium">Xalis (öhdəliklə)</td>
                <td className="py-3 px-3" />
                <td
                  className="py-3 px-3 text-right font-medium"
                  style={{
                    color: netCommitted >= 0 ? 'var(--brand-text)' : 'var(--state-error)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatAZN(netCommitted)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
          "Öhdəlik" sırası ödənilməmiş outsource sifarişlərini də daxil edir —
          forecast üçün konservativ baxış.
        </p>
      </div>
    </div>
  );
}

function PnLRow({
  label,
  count,
  amount,
  negative,
  muted,
}: {
  label: string;
  count: number;
  amount: number;
  negative?: boolean;
  muted?: boolean;
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <td className="py-2 px-3" style={{ color: muted ? 'var(--text-muted)' : 'var(--text)' }}>
        {label}
      </td>
      <td
        className="py-2 px-3 text-meta"
        style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
      >
        {count}
      </td>
      <td
        className="py-2 px-3 text-right"
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: muted ? 'var(--text-muted)' : negative ? 'var(--state-error)' : 'var(--text)',
        }}
      >
        {negative ? `−${formatAZN(amount).replace(/^−|^-/, '')}` : formatAZN(amount)}
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'positive' | 'negative';
}) {
  const color = accent
    ? 'var(--brand-text)'
    : tone === 'negative'
      ? 'var(--state-error)'
      : tone === 'positive'
        ? '#15803D'
        : 'var(--text)';
  return (
    <div className="card flex flex-col">
      <span className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-h2 mt-1" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

function sum(rows: Array<{ amount: number | string | null }>): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}
