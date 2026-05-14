/**
 * Project P&L — REQ-FIN-06.
 *
 * Per-project income, direct expenses, outsource costs, net.
 * Admin-only surface (parent gates with isAdmin); each underlying table
 * has admin-only RLS so a non-admin call returns empty rows anyway.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatAZN } from '@/lib/format';

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
                    color: netCommitted >= 0 ? 'var(--brand-text)' : 'var(--error-deep)',
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
          color: muted ? 'var(--text-muted)' : negative ? 'var(--error-deep)' : 'var(--text)',
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
      ? 'var(--error-deep)'
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
