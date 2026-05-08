import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatAZN, formatDate } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { IncomeModal } from '@/components/IncomeModal';
import { ExpenseModal } from '@/components/ExpenseModal';
import { OutsourceModal } from '@/components/OutsourceModal';
import { RecurringExpenseModal } from '@/components/RecurringExpenseModal';
import {
  OUTSOURCE_STATUS_LABEL,
  OUTSOURCE_STATUS_ORDER,
  OutsourceStatus,
  RECURRING_PERIOD_LABEL,
  RecurringPeriod,
  useDeleteRecurringExpense,
  useMarkPaid,
  useOutsourceItems,
  useProjectPL,
  useRecurringExpenses,
  useUpdateOutsourceStatus,
  ValidationError,
} from '@/lib/finance';

const TABS = ['Cash Cockpit', 'P&L', 'Outsource', 'Xərclər', 'Debitor', 'Forecast'] as const;

export function FinancePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Cash Cockpit');
  const [openModal, setOpenModal] = useState<null | 'income' | 'expense' | 'outsource' | 'recurring'>(null);

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
    queryFn: async () => (await supabase.from('receivables').select('*').limit(200)).data ?? [],
  });
  const forecasts = useQuery({
    queryKey: ['fin', 'forecast'],
    queryFn: async () =>
      (await supabase.from('cash_forecasts').select('*').order('generated_at', { ascending: false }).limit(3)).data ?? [],
  });

  const totalIn = (incomes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const totalOut = (expenses.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const balance = totalIn - totalOut;

  return (
    <>
      <PageHead
        meta="Admin yalnız"
        title="Maliyyə Mərkəzi"
        actions={
          <>
            <button className="btn-outline" onClick={() => setOpenModal('expense')}>+ Xərc</button>
            <button className="btn-primary" onClick={() => setOpenModal('income')}>+ Gəlir</button>
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
        <Stat label="Debitor" value={formatAZN((receivables.data ?? []).reduce((s: number, r: any) => s + (Number(r.amount) - Number(r.paid_amount)), 0))} />
      </div>

      <nav className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t} className={`chip ${tab === t ? 'chip-brand' : ''}`} onClick={() => setTab(t)}>
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
        <DebitorTable rows={(receivables.data ?? []) as any[]} />
      ) : null}

      {tab === 'Forecast' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(forecasts.data ?? []).length === 0 ? (
            <div className="card text-meta col-span-3">Forecast hələ qurulmayıb. /api/cron/forecast cron-u işə düşəndən sonra görünəcək.</div>
          ) : null}
          {(forecasts.data ?? []).map((f: any) => (
            <div key={f.id} className="card">
              <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {f.horizon_days} gün
              </div>
              <div className="text-h2 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatAZN(f.projected_balance)}
              </div>
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {formatAZN(f.confidence_low)} – {formatAZN(f.confidence_high)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'P&L' ? <PLTab /> : null}
      {tab === 'Outsource' ? <OutsourceTab /> : null}
      {tab === 'Xərclər' ? <XercTab /> : null}

      {openModal === 'income' ? <IncomeModal onClose={() => setOpenModal(null)} /> : null}
      {openModal === 'expense' ? <ExpenseModal onClose={() => setOpenModal(null)} /> : null}
      {openModal === 'outsource' ? <OutsourceModal onClose={() => setOpenModal(null)} /> : null}
      {openModal === 'recurring' ? <RecurringExpenseModal onClose={() => setOpenModal(null)} /> : null}
    </>
  );
}

type Receivable = {
  id: string;
  client_id: string | null;
  amount: number;
  paid_amount: number;
  status: string;
  due_at: string | null;
};

function DebitorTable({ rows }: { rows: Receivable[] }) {
  const markPaid = useMarkPaid();
  const [editing, setEditing] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(id: string) {
    setErr(null);
    try {
      await markPaid.mutateAsync({ id, delta: Number(delta) });
      setEditing(null);
      setDelta('');
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  if (rows.length === 0) {
    return <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>Açıq debitor yoxdur.</div>;
  }
  return (
    <div className="card overflow-x-auto" style={{ padding: 0 }}>
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Müştəri', 'Məbləğ', 'Ödənilib', 'Qalıq', 'Status', 'Müddət', ''].map((h) => (
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
          {rows.map((r) => {
            const remaining = Number(r.amount) - Number(r.paid_amount ?? 0);
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{r.client_id ?? '—'}</td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.amount)}</td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.paid_amount)}</td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(remaining)}</td>
                <td className="py-3 px-3"><span className="chip">{r.status}</span></td>
                <td className="py-3 px-3">{formatDate(r.due_at)}</td>
                <td className="py-3 px-3 text-right">
                  {r.status === 'paid' ? (
                    <span className="text-meta" style={{ color: 'var(--text-muted)' }}>—</span>
                  ) : editing === r.id ? (
                    <span className="inline-flex gap-2 items-center">
                      <input
                        autoFocus
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={remaining}
                        value={delta}
                        onChange={(e) => setDelta(e.target.value)}
                        className="input"
                        style={{ width: 110, height: 32 }}
                        placeholder={String(remaining)}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ height: 32, padding: '0 12px' }}
                        onClick={() => submit(r.id)}
                        disabled={markPaid.isPending}
                      >
                        Tətbiq et
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ height: 32, padding: '0 8px' }}
                        onClick={() => {
                          setEditing(null);
                          setErr(null);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ height: 32, padding: '0 12px' }}
                      onClick={() => {
                        setEditing(r.id);
                        setDelta('');
                        setErr(null);
                      }}
                    >
                      Ödəniş
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {err ? (
        <div className="px-3 py-2 text-meta" style={{ color: '#B91C1C' }}>{err}</div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div
        className="text-h1 mt-1"
        style={{ color: accent ? 'var(--brand-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

function byMonth(ins: any[], outs: any[]) {
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

// ============================================================================
// REQ-FIN-06 — P&L tab
// ============================================================================
function PLTab() {
  const { data: rows = [], isLoading } = useProjectPL();
  if (isLoading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Hələ aktivlik olan layihə yoxdur.
      </div>
    );
  }
  const totals = rows.reduce(
    (a, r) => ({
      income: a.income + r.income,
      expenses: a.expenses + r.expenses,
      outsource: a.outsource + r.outsource,
      net: a.net + r.net,
    }),
    { income: 0, expenses: 0, outsource: 0, net: 0 },
  );
  return (
    <div className="card overflow-x-auto" style={{ padding: 0 }}>
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Layihə', 'Gəlir', 'Xərc', 'Outsource', 'Net'].map((h, i) => (
              <th
                key={h}
                className={`py-3 px-3 text-meta ${i === 0 ? 'text-left' : 'text-right'}`}
                style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.project_id ?? '_'} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <td className="py-2 px-3">{r.name}</td>
              <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.income)}</td>
              <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.expenses)}</td>
              <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.outsource)}</td>
              <td
                className="py-2 px-3 text-right font-medium"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: r.net < 0 ? '#B91C1C' : 'var(--brand-text)',
                }}
              >
                {formatAZN(r.net)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--line)' }}>
            <td className="py-3 px-3 font-semibold">Cəmi</td>
            <td className="py-3 px-3 text-right font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(totals.income)}</td>
            <td className="py-3 px-3 text-right font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(totals.expenses)}</td>
            <td className="py-3 px-3 text-right font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(totals.outsource)}</td>
            <td
              className="py-3 px-3 text-right font-semibold"
              style={{
                fontVariantNumeric: 'tabular-nums',
                color: totals.net < 0 ? '#B91C1C' : 'var(--brand-text)',
              }}
            >
              {formatAZN(totals.net)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// REQ-FIN-07 — Outsource tab (admin amounts; users live on /podrat)
// ============================================================================
type OutsourceRow = {
  id: string;
  project_id: string | null;
  work_title: string;
  contact_person: string | null;
  contact_company: string | null;
  amount: number;
  payment_method: string | null;
  responsible_user_id: string | null;
  deadline: string | null;
  paid_at: string | null;
  status: OutsourceStatus;
};

function OutsourceTab() {
  const { data: rows = [], isLoading } = useOutsourceItems() as { data: OutsourceRow[]; isLoading: boolean };
  const update = useUpdateOutsourceStatus();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end mb-3">
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Outsource</button>
      </div>
      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Outsource yoxdur.
        </div>
      ) : (
        <div className="card overflow-x-auto" style={{ padding: 0 }}>
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İş', 'Şirkət', 'Məbləğ', 'Müddət', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    className={`py-3 px-3 text-meta ${i === 2 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-2 px-3">
                    <div className="font-medium">{r.work_title}</div>
                    {r.contact_person ? (
                      <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{r.contact_person}</div>
                    ) : null}
                  </td>
                  <td className="py-2 px-3">{r.contact_company ?? '—'}</td>
                  <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(r.amount)}
                  </td>
                  <td className="py-2 px-3">{formatDate(r.deadline)}</td>
                  <td className="py-2 px-3">
                    <select
                      className="input"
                      style={{ height: 32, padding: '0 8px' }}
                      value={r.status}
                      disabled={update.isPending}
                      onChange={(e) =>
                        update.mutate({ id: r.id, status: e.target.value as OutsourceStatus })
                      }
                    >
                      {OUTSOURCE_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{OUTSOURCE_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? <OutsourceModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

// ============================================================================
// REQ-FIN-05 — Xərclər tab (one-off + recurring)
// ============================================================================
type ExpenseRow = {
  id: string;
  amount: number;
  category: string | null;
  vendor: string | null;
  occurred_at: string;
  recurring_rule_id: string | null;
};
type RecurringRow = {
  id: string;
  label: string;
  amount: number;
  period: RecurringPeriod;
  next_run_at: string;
};

function XercTab() {
  const { data: recurring = [], isLoading: recLoading } = useRecurringExpenses() as { data: RecurringRow[]; isLoading: boolean };
  const expenses = useQuery({
    queryKey: ['fin', 'expenses-list'],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, category, vendor, occurred_at, recurring_rule_id')
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });
  const del = useDeleteRecurringExpense();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-h3">Sabit xərclər</h3>
          <button className="btn-outline" onClick={() => setOpen(true)}>+ Sabit xərc</button>
        </div>
        {recLoading ? (
          <div className="card text-meta">Yüklənir…</div>
        ) : recurring.length === 0 ? (
          <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
            Hələ sabit xərc yoxdur.
          </div>
        ) : (
          <div className="card overflow-x-auto" style={{ padding: 0 }}>
            <table className="w-full text-body">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Ad', 'Dövr', 'Məbləğ', 'Növbəti', ''].map((h, i) => (
                    <th
                      key={h}
                      className={`py-3 px-3 text-meta ${i === 2 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-2 px-3">{r.label}</td>
                    <td className="py-2 px-3">{RECURRING_PERIOD_LABEL[r.period]}</td>
                    <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(r.amount)}
                    </td>
                    <td className="py-2 px-3">{formatDate(r.next_run_at)}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        className="btn-ghost"
                        style={{ height: 32, padding: '0 12px' }}
                        onClick={() => {
                          if (confirm(`"${r.label}" qaydası silinsin?`)) del.mutate(r.id);
                        }}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-h3 mb-3">Bir dəfəlik xərclər</h3>
        {expenses.isLoading ? (
          <div className="card text-meta">Yüklənir…</div>
        ) : (expenses.data ?? []).length === 0 ? (
          <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
            Xərc yoxdur.
          </div>
        ) : (
          <div className="card overflow-x-auto" style={{ padding: 0 }}>
            <table className="w-full text-body">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Tarix', 'Kateqoriya', 'Təchizatçı', 'Məbləğ', 'Mənbə'].map((h, i) => (
                    <th
                      key={h}
                      className={`py-3 px-3 text-meta ${i === 3 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(expenses.data ?? []).map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-2 px-3">{formatDate(r.occurred_at)}</td>
                    <td className="py-2 px-3">{r.category ?? '—'}</td>
                    <td className="py-2 px-3">{r.vendor ?? '—'}</td>
                    <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(r.amount)}
                    </td>
                    <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                      {r.recurring_rule_id ? 'Sabit' : 'Bir dəfəlik'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open ? <RecurringExpenseModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
