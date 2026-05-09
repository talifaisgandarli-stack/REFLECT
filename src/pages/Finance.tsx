import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatAZN, formatDate, bakuMonthKey, bakuCurrentMonthRange } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { IncomeExpenseModal, type FinanceKind } from '@/components/IncomeExpenseModal';
import { MarkPaidModal } from '@/components/MarkPaidModal';

const TABS = ['Cash Cockpit', 'P&L', 'Outsource', 'Xərclər', 'Sabit', 'Debitor', 'Forecast'] as const;

const PERIOD_LABEL: Record<string, string> = {
  weekly: 'Həftəlik',
  monthly: 'Aylıq',
  quarterly: 'Rüblük',
  yearly: 'İllik',
};

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

  // REQ-FIN-09: "(cari ay)" stats use Asia/Baku month boundaries, not UTC.
  const { start: monthStart, end: monthEnd } = bakuCurrentMonthRange();
  const inMonth = (occurredAt: string | null | undefined) => {
    if (!occurredAt) return false;
    const t = new Date(occurredAt).getTime();
    return t >= monthStart.getTime() && t < monthEnd.getTime();
  };
  const totalIn = (incomes.data ?? [])
    .filter((r: { occurred_at: string | null }) => inMonth(r.occurred_at))
    .reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
  const totalOut = (expenses.data ?? [])
    .filter((r: { occurred_at: string | null }) => inMonth(r.occurred_at))
    .reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
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

      {tab === 'Forecast' ? <ForecastPanel forecasts={forecasts.data ?? []} /> : null}

      {tab === 'Xərclər' ? <ExpensesTable /> : null}
      {tab === 'Sabit' ? <RecurringExpensesPanel /> : null}

      {tab === 'P&L' || tab === 'Outsource' ? (
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

type ExpenseRow = {
  id: string;
  amount: number;
  category: string | null;
  vendor: string | null;
  note: string | null;
  occurred_at: string | null;
  recurring_rule_id: string | null;
};

function ExpensesTable() {
  // Recent expenses, including auto-materialized recurring rows (REQ-FIN-05).
  const q = useQuery({
    queryKey: ['fin', 'expenses', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, category, vendor, note, occurred_at, recurring_rule_id')
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Tarix', 'Kateqoriya', 'Qeyd', 'Mənbə', 'Məbləğ'].map((h) => (
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
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <td className="py-3 px-3">{formatDate(r.occurred_at)}</td>
              <td className="py-3 px-3">{r.category ?? '—'}</td>
              <td className="py-3 px-3">{r.note ?? r.vendor ?? '—'}</td>
              <td className="py-3 px-3">
                {r.recurring_rule_id ? (
                  <span className="chip chip-brand">Sabit</span>
                ) : (
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Manual</span>
                )}
              </td>
              <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatAZN(r.amount)}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-meta" style={{ color: 'var(--text-muted)' }}>
                Xərc yazılmayıb.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

type RecurringRow = {
  id: string;
  label: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_run_at: string;
};

function RecurringExpensesPanel() {
  // REQ-FIN-05: admin manages recurring expense rules; cron materializes them.
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['fin', 'recurring'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('id, label, amount, period, next_run_at')
        .order('next_run_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecurringRow[];
    },
  });
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<RecurringRow['period']>('monthly');
  const [nextRun, setNextRun] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const num = Number(amount);
      if (!label.trim()) throw new Error('Ad daxil edin');
      if (!Number.isFinite(num) || num <= 0) throw new Error('Məbləğ müsbət olmalıdır');
      const { error: e } = await supabase.from('recurring_expenses').insert({
        label: label.trim(),
        amount: num,
        period,
        next_run_at: new Date(nextRun).toISOString(),
      });
      if (e) throw e;
    },
    onSuccess: () => {
      setLabel('');
      setAmount('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['fin', 'recurring'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from('recurring_expenses').delete().eq('id', id);
      if (e) throw e;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin', 'recurring'] }),
  });

  const rows = q.data ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card md:col-span-2 overflow-x-auto">
        <h3 className="text-h3 mb-3">Sabit xərclər</h3>
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Ad', 'Dövr', 'Növbəti', 'Məbləğ', ''].map((h) => (
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
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{r.label}</td>
                <td className="py-3 px-3">{PERIOD_LABEL[r.period] ?? r.period}</td>
                <td className="py-3 px-3">{formatDate(r.next_run_at)}</td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(r.amount)}
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => remove.mutate(r.id)}
                    disabled={remove.isPending}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-meta" style={{ color: 'var(--text-muted)' }}>
                  Sabit xərc qaydası yoxdur.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <form
        className="card flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h3 className="text-h3">Yeni qayda</h3>
        <label className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Ad
          <input
            className="input mt-1 w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ofis kirayəsi"
          />
        </label>
        <label className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Məbləğ (AZN)
          <input
            className="input mt-1 w-full"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Dövr
          <select
            className="input mt-1 w-full"
            value={period}
            onChange={(e) => setPeriod(e.target.value as RecurringRow['period'])}
          >
            <option value="weekly">Həftəlik</option>
            <option value="monthly">Aylıq</option>
            <option value="quarterly">Rüblük</option>
            <option value="yearly">İllik</option>
          </select>
        </label>
        <label className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Növbəti tarix
          <input
            className="input mt-1 w-full"
            type="date"
            value={nextRun}
            onChange={(e) => setNextRun(e.target.value)}
          />
        </label>
        {error ? (
          <div className="text-meta" style={{ color: 'var(--danger, #c33)' }}>
            {error}
          </div>
        ) : null}
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Əlavə et
        </button>
      </form>
    </div>
  );
}

// ── Forecast panel (REQ-FIN-08 / US-FIN-07) ─────────────────────────────────

type ForecastRow = {
  id: string;
  horizon_days: number;
  projected_balance: number;
  confidence_low: number;
  confidence_high: number;
  generated_at: string;
};

function ForecastPanel({ forecasts }: { forecasts: ForecastRow[] }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);
  const qc = useQueryClient();

  // The latest generated_at across all rows tells us when the last refresh ran.
  const latestGenerated = forecasts.length > 0
    ? forecasts.reduce((a, b) => a.generated_at > b.generated_at ? a : b).generated_at
    : null;

  const canRefresh = !latestGenerated || (Date.now() - new Date(latestGenerated).getTime() > 24 * 3_600_000);

  async function refresh() {
    setRefreshing(true);
    setRefreshErr(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı');
      const res = await fetch('/api/finance/refresh-forecast', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Xəta (${res.status})`);
      qc.invalidateQueries({ queryKey: ['fin', 'forecast'] });
    } catch (e) {
      setRefreshErr(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Bu proqnoz son 6 ayın məlumatlarına əsaslanır.
        </p>
        <button
          className="btn-outline"
          onClick={refresh}
          disabled={refreshing || !canRefresh}
          title={!canRefresh ? 'Forecast 24 saatda 1 dəfə yenilənir' : undefined}
        >
          {refreshing ? 'Yenilənir…' : 'Yenilə'}
        </button>
      </div>
      {refreshErr ? <p className="text-meta mb-3" style={{ color: '#EF4444' }}>{refreshErr}</p> : null}
      {forecasts.length === 0 ? (
        <div className="card text-meta col-span-3" style={{ color: 'var(--text-muted)' }}>
          Forecast hələ hazır deyil. Cron sabah işə düşəcək.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {forecasts.map((f) => (
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
      )}
      {latestGenerated ? (
        <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
          Son yeniləmə: {formatDate(latestGenerated)}
        </p>
      ) : null}
    </div>
  );
}

function byMonth(
  ins: Array<{ amount: number; occurred_at: string | null }>,
  outs: Array<{ amount: number; occurred_at: string | null }>,
) {
  // REQ-FIN-09: bucket by Asia/Baku month, not UTC slice.
  const m: Record<string, { m: string; in: number; out: number }> = {};
  for (const r of ins) {
    const k = bakuMonthKey(r.occurred_at);
    if (!k) continue;
    m[k] ??= { m: k, in: 0, out: 0 };
    m[k].in += Number(r.amount);
  }
  for (const r of outs) {
    const k = bakuMonthKey(r.occurred_at);
    if (!k) continue;
    m[k] ??= { m: k, in: 0, out: 0 };
    m[k].out += Number(r.amount);
  }
  return Object.values(m).sort((a, b) => a.m.localeCompare(b.m));
}
