import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatAZN, formatDate } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { IncomeExpenseModal, type FinanceKind } from '@/components/IncomeExpenseModal';
import { MarkPaidModal } from '@/components/MarkPaidModal';

const TABS = ['Cash Cockpit', 'P&L', 'Outsource', 'Xərclər', 'Debitor', 'Forecast'] as const;

type Receivable = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  amount: number;
  paid_amount: number;
  status: 'open' | 'partial' | 'paid' | 'overdue';
  due_at: string | null;
};

export function FinancePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Cash Cockpit');
  const [modal, setModal] = useState<FinanceKind | null>(null);
  const [markPaid, setMarkPaid] = useState<Receivable | null>(null);

  const incomes = useQuery({
    queryKey: ['fin', 'incomes'],
    queryFn: async () => (await supabase.from('incomes').select('*').limit(200)).data ?? [],
  });
  const expenses = useQuery({
    queryKey: ['fin', 'expenses'],
    queryFn: async () => (await supabase.from('expenses').select('*').limit(200)).data ?? [],
  });
  const receivables = useQuery({
    queryKey: ['fin', 'receivables'],
    queryFn: async () =>
      ((await supabase.from('receivables').select('*').limit(200)).data ?? []) as Receivable[],
  });
  const forecasts = useQuery({
    queryKey: ['fin', 'forecast'],
    queryFn: async () =>
      (
        await supabase
          .from('cash_forecasts')
          .select('*')
          .order('generated_at', { ascending: false })
          .limit(3)
      ).data ?? [],
  });

  const totalIn = (incomes.data ?? []).reduce(
    (s: number, r: { amount: number }) => s + Number(r.amount),
    0,
  );
  const totalOut = (expenses.data ?? []).reduce(
    (s: number, r: { amount: number }) => s + Number(r.amount),
    0,
  );
  const balance = totalIn - totalOut;
  const debtor = (receivables.data ?? []).reduce(
    (s, r) => s + (Number(r.amount) - Number(r.paid_amount)),
    0,
  );

  return (
    <>
      <PageHead
        meta="Admin yalnız"
        title="Maliyyə Mərkəzi"
        actions={
          <>
            <button className="btn-outline" onClick={() => setModal('expense')}>
              + Xərc
            </button>
            <button className="btn-primary" onClick={() => setModal('income')}>
              + Gəlir
            </button>
          </>
        }
      />

      {/* Cash Cockpit sticky bar */}
      <div
        className="card mb-5 flex flex-wrap gap-6 sticky top-0 z-10"
        style={{ background: 'var(--surface)' }}
      >
        <Stat label="Cari balans" value={formatAZN(balance)} accent />
        <Stat label="Gəlir (cari ay)" value={formatAZN(totalIn)} />
        <Stat label="Xərc (cari ay)" value={formatAZN(totalOut)} />
        <Stat label="Debitor" value={formatAZN(debtor)} />
      </div>

      <nav className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            className={`chip ${tab === t ? 'chip-brand' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Cash Cockpit' ? (
        <div className="card" style={{ height: 320 }}>
          <h3 className="text-h3 mb-3">Aylıq cash flow</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byMonth(incomes.data ?? [], expenses.data ?? [])}>
              <XAxis dataKey="m" stroke="#7A857F" />
              <YAxis stroke="#7A857F" />
              <Tooltip />
              <Bar dataKey="in" fill="#ADFB49" />
              <Bar dataKey="out" fill="#1A5140" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {tab === 'Debitor' ? (
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Müştəri', 'Məbləğ', 'Ödənilib', 'Status', 'Müddət', ''].map((h) => (
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
            {(receivables.data ?? []).map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{r.client_id ?? '—'}</td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(r.amount)}
                </td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(r.paid_amount)}
                </td>
                <td className="py-3 px-3">{r.status}</td>
                <td className="py-3 px-3">{formatDate(r.due_at)}</td>
                <td className="py-3 px-3 text-right">
                  {r.status !== 'paid' ? (
                    <button
                      type="button"
                      className="chip chip-brand"
                      onClick={() => setMarkPaid(r)}
                    >
                      Ödənişi qeyd et
                    </button>
                  ) : (
                    <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      ✓
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(receivables.data ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-6 text-center text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Açıq debitor yoxdur.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}

      {tab === 'Forecast' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(forecasts.data ?? []).length === 0 ? (
            <div className="card text-meta col-span-3">
              Forecast hələ qurulmayıb. /api/cron/forecast cron-u işə düşəndən sonra görünəcək.
            </div>
          ) : null}
          {(forecasts.data ?? []).map(
            (f: {
              id: string;
              horizon_days: number;
              projected_balance: number;
              confidence_low: number;
              confidence_high: number;
            }) => (
              <div key={f.id} className="card">
                <div
                  className="text-meta uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {f.horizon_days} gün
                </div>
                <div className="text-h2 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(f.projected_balance)}
                </div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {formatAZN(f.confidence_low)} – {formatAZN(f.confidence_high)}
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      {tab === 'P&L' || tab === 'Outsource' || tab === 'Xərclər' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} cədvəli — v1.5-də.
        </div>
      ) : null}

      {modal ? <IncomeExpenseModal kind={modal} onClose={() => setModal(null)} /> : null}
      {markPaid ? (
        <MarkPaidModal receivable={markPaid} onClose={() => setMarkPaid(null)} />
      ) : null}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div
        className="text-h1 mt-1"
        style={{
          color: accent ? 'var(--brand-text)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function byMonth(
  ins: Array<{ amount: number; occurred_at: string | null }>,
  outs: Array<{ amount: number; occurred_at: string | null }>,
) {
  const m: Record<string, { m: string; in: number; out: number }> = {};
  for (const r of ins) {
    const k = (r.occurred_at ?? '').slice(0, 7);
    m[k] ??= { m: k, in: 0, out: 0 };
    m[k].in += Number(r.amount);
  }
  for (const r of outs) {
    const k = (r.occurred_at ?? '').slice(0, 7);
    m[k] ??= { m: k, in: 0, out: 0 };
    m[k].out += Number(r.amount);
  }
  return Object.values(m).sort((a, b) => a.m.localeCompare(b.m));
}
