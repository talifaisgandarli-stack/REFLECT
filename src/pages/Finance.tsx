import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatAZN, formatDate, bakuMonthKey, bakuCurrentMonthRange } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ComposedChart, Line, Area, CartesianGrid, Cell } from 'recharts';
import { IncomeExpenseModal, type FinanceKind } from '@/components/IncomeExpenseModal';
import { MarkPaidModal } from '@/components/MarkPaidModal';
import { InvoiceFromTemplateModal } from '@/components/InvoiceFromTemplateModal';

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
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Cash Cockpit');
  const [modal, setModal] = useState<FinanceKind | null>(null);
  const [markPaid, setMarkPaid] = useState<Receivable | null>(null);
  const [invoiceModal, setInvoiceModal] = useState(false);

  // PRD §REQ-FIN-03 — bulk mark-paid for Debitor tab (admin)
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkMarkPaid, setConfirmBulkMarkPaid] = useState(false);
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
  }
  const bulkMarkPaid = useMutation({
    mutationFn: async (rows: Array<{ id: string; amount: number; paid_amount: number }>) => {
      // Insert one payment row per receivable for the remaining amount.
      // DB trigger (migration 0040) updates receivables.paid_amount + status.
      const { data: sess } = await supabase.auth.getSession();
      const recorderId = sess.session?.user?.id ?? null;
      const inserts = rows
        .map((r) => ({
          receivable_id: r.id,
          amount: Number(r.amount) - Number(r.paid_amount),
          payment_method: 'bank_transfer' as const,
          note: 'Toplu işarələmə',
          recorded_by: recorderId,
        }))
        .filter((r) => r.amount > 0);
      if (inserts.length === 0) return 0;
      const { error } = await supabase.from('receivable_payments').insert(inserts);
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['fin', 'receivables'] });
      exitBulkMode();
      if (count) toast.success(`${count} debitor tam ödəniş kimi qeyd edildi`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

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
      ((
        await supabase
          .from('receivables')
          .select('*, clients(name, company)')
          .limit(200)
      ).data ?? []) as Array<Receivable & { clients?: { name: string; company: string | null } | null }>,
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
            <button className="btn-outline" onClick={() => setInvoiceModal(true)}>
              + Faktura
            </button>
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
        {TABS.map((t) => {
          // PRD §REQ-FIN-03 — surface overdue/open receivable count on the Debitor tab
          // so admin sees pressure without clicking through.
          const openCount = t === 'Debitor'
            ? (receivables.data ?? []).filter((r) => r.status !== 'paid').length
            : 0;
          return (
            <button
              key={t}
              className={`chip ${tab === t ? 'chip-brand' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
              {openCount > 0 ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontVariantNumeric: 'tabular-nums',
                    background: tab === t ? 'var(--ink)' : 'var(--brand-action)',
                    color: tab === t ? 'var(--brand-action)' : 'var(--ink)',
                    padding: '0 5px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {openCount}
                </span>
              ) : null}
            </button>
          );
        })}
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
        <>
          {/* PRD §REQ-FIN — receivable aging chart (0-30 / 31-60 / 61-90 / 90+) */}
          {(receivables.data ?? []).length > 0 ? (
            <ReceivableAgingChart receivables={receivables.data ?? []} />
          ) : null}
        {/* PRD §REQ-FIN-03 — bulk mode toggle */}
        {(receivables.data ?? []).filter((r) => r.status !== 'paid').length > 1 ? (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              className={`btn-outline ${bulkMode ? 'border-brand-text' : ''}`}
              style={bulkMode ? { background: 'var(--brand-action)', color: 'var(--ink)' } : undefined}
              onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
            >
              {bulkMode ? `✓ Seçim (${selectedIds.size})` : 'Toplu seç'}
            </button>
          </div>
        ) : null}
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {bulkMode ? (
                <th className="text-left py-3 pl-3 text-meta" style={{ color: 'var(--text-muted)', width: 32 }}>
                  {' '}
                </th>
              ) : null}
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
            {(receivables.data ?? []).map((r) => {
              // Overdue: due_at in the past AND not yet fully paid
              const isOverdue =
                r.status !== 'paid' &&
                r.due_at != null &&
                new Date(r.due_at).getTime() < Date.now();
              return (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid var(--line-soft)',
                    background: selectedIds.has(r.id) ? 'var(--brand-glow-sm)' : (isOverdue ? 'var(--error-bg, #fde0e0)' : undefined),
                  }}
                >
                  {bulkMode ? (
                    <td className="py-3 pl-3" style={{ width: 32 }}>
                      {r.status !== 'paid' ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          aria-label={`Seç ${r.clients?.name ?? r.id.slice(0, 8)}`}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td className="py-3 px-3">
                    {r.clients?.company ?? r.clients?.name ?? (r.client_id ? '—' : '—')}
                  </td>
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(r.amount)}
                  </td>
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(r.paid_amount)}
                  </td>
                  <td className="py-3 px-3">
                    {isOverdue ? (
                      <span
                        className="chip"
                        style={{
                          background: 'var(--error-deep, #b3261e)',
                          color: 'white',
                          fontSize: 10,
                          padding: '1px 8px',
                        }}
                      >
                        Gecikmiş
                      </span>
                    ) : (
                      r.status
                    )}
                  </td>
                  <td className="py-3 px-3" style={{ color: isOverdue ? 'var(--error-deep, #b3261e)' : undefined, fontWeight: isOverdue ? 600 : 400 }}>
                    {formatDate(r.due_at)}
                  </td>
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
              );
            })}
            {(receivables.data ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={bulkMode ? 7 : 6}
                  className="py-6 text-center text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Açıq debitor yoxdur.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </>
      ) : null}

      {tab === 'Forecast' ? (
        <div className="space-y-4">
          {(forecasts.data ?? []).length === 0 ? (
            <div className="card text-meta">
              Forecast hələ qurulmayıb. /api/cron/forecast cron-u işə düşəndən sonra görünəcək.
            </div>
          ) : (
            <>
              {/* PRD §REQ-FIN-08 — visual confidence band across 30/60/90 horizons */}
              <ForecastChart forecasts={forecasts.data ?? []} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            </>
          )}
        </div>
      ) : null}

      {tab === 'Xərclər' ? <ExpensesTable /> : null}
      {tab === 'Sabit' ? <RecurringExpensesPanel /> : null}

      {tab === 'P&L' ? <PnLTable incomes={incomes.data ?? []} expenses={expenses.data ?? []} /> : null}
      {tab === 'Outsource' ? <OutsourceSummary /> : null}

      {modal ? <IncomeExpenseModal kind={modal} onClose={() => setModal(null)} /> : null}
      {markPaid ? (
        <MarkPaidModal receivable={markPaid} onClose={() => setMarkPaid(null)} />
      ) : null}
      {invoiceModal ? <InvoiceFromTemplateModal onClose={() => setInvoiceModal(false)} /> : null}

      {/* Confirm before mass-marking receivables paid (PRD §UX destructive guard) */}
      <ConfirmDialog
        open={confirmBulkMarkPaid}
        title={`${selectedIds.size} debitor tam ödəniş kimi qeyd edilsin?`}
        body="Hər biri üçün qalan məbləğ qədər `receivable_payments` sırası yaradılacaq. Bu əməliyyat geri qaytarıla bilər (admin sıraları siləndə paid_amount yenidən hesablanır)."
        confirmLabel="Hə, qeyd et"
        busy={bulkMarkPaid.isPending}
        onConfirm={() => {
          const rows = (receivables.data ?? []).filter((r) => selectedIds.has(r.id));
          bulkMarkPaid.mutate(rows);
          setConfirmBulkMarkPaid(false);
        }}
        onCancel={() => setConfirmBulkMarkPaid(false)}
      />

      {/* PRD §REQ-FIN-03 — floating bulk action bar (admin) */}
      {bulkMode && selectedIds.size > 0 ? (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-capsule px-4 py-3 flex items-center gap-3 shadow-xl z-40"
          style={{
            background: 'var(--ink)',
            color: 'var(--canvas)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: 340,
          }}
        >
          <span className="text-body font-medium">{selectedIds.size} debitor seçili</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--canvas)' }}
            disabled={bulkMarkPaid.isPending}
            onClick={() => setConfirmBulkMarkPaid(true)}
          >
            {bulkMarkPaid.isPending ? 'Qeyd edilir…' : 'Tam ödəniş kimi qeyd et'}
          </button>
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)' }}
            onClick={exitBulkMode}
            aria-label="Seçim rejimini bağla"
          >
            ×
          </button>
        </div>
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

// PRD §REQ-FIN-08 — visualize MIRAI cash forecast as a confidence band.
// Plots projected_balance as a line with a low/high shaded area so the
// uncertainty range is immediately legible (vs. raw text was earlier).
// PRD §REQ-FIN — receivable aging breakdown bar chart (0-30/31-60/61-90/90+)
function ReceivableAgingChart({
  receivables,
}: {
  receivables: Array<{
    id: string;
    amount: number;
    paid_amount: number;
    due_at: string | null;
    status: string;
  }>;
}) {
  const today = Date.now();
  const buckets = [
    { key: 'current', label: 'Gələcək', max: 0, color: 'var(--success-deep, #16794a)' },
    { key: '0-30', label: '0–30 gün', max: 30, color: 'var(--brand-action, #adfb49)' },
    { key: '31-60', label: '31–60 gün', max: 60, color: '#c47d00' },
    { key: '61-90', label: '61–90 gün', max: 90, color: '#d97706' },
    { key: '90+', label: '90+ gün', max: Infinity, color: 'var(--error-deep, #b3261e)' },
  ];

  const data = buckets.map((b) => ({ label: b.label, amount: 0, count: 0, color: b.color }));

  for (const r of receivables) {
    if (r.status === 'paid') continue;
    const remaining = Number(r.amount) - Number(r.paid_amount);
    if (remaining <= 0) continue;
    if (!r.due_at) continue;
    const daysOverdue = (today - new Date(r.due_at).getTime()) / 86_400_000;
    let idx: number;
    if (daysOverdue < 0) idx = 0; // not yet due
    else if (daysOverdue <= 30) idx = 1;
    else if (daysOverdue <= 60) idx = 2;
    else if (daysOverdue <= 90) idx = 3;
    else idx = 4;
    data[idx].amount += remaining;
    data[idx].count += 1;
  }

  const totalOpen = data.reduce((s, d) => s + d.amount, 0);
  if (totalOpen === 0) return null;

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-h3">Debitor yaşı</h3>
        <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Cəmi açıq: {formatAZN(totalOpen)}
        </span>
      </div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={11}
              tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
            />
            <Tooltip
              cursor={{ fill: 'var(--brand-glow-sm)' }}
              contentStyle={{
                background: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                color: 'var(--canvas)',
              }}
              formatter={(value, _name, item) => {
                const count = (item?.payload as { count?: number } | undefined)?.count ?? 0;
                return [`${formatAZN(Number(value))} · ${count} debitor`, 'Açıq qalıq'];
              }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ForecastChart({
  forecasts,
}: {
  forecasts: Array<{
    id: string;
    horizon_days: number;
    projected_balance: number;
    confidence_low: number;
    confidence_high: number;
  }>;
}) {
  // Recharts wants ascending x-axis; sort by horizon, prepend a "today" zero anchor
  const sorted = [...forecasts].sort((a, b) => a.horizon_days - b.horizon_days);
  if (sorted.length === 0) return null;
  const data = sorted.map((f) => ({
    horizon: `${f.horizon_days} gün`,
    projected: f.projected_balance,
    low: f.confidence_low,
    high: f.confidence_high,
    // For the band: Recharts Area uses two values (low, high) — encode as `band`
    band: [f.confidence_low, f.confidence_high],
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-h3">Forecast etibar diapazonu</h3>
        <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          MIRAI Maliyyə Analitiki · gündəlik cron
        </span>
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="horizon" stroke="var(--text-muted)" fontSize={12} />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={12}
              tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                color: 'var(--canvas)',
              }}
              formatter={(value, name) => {
                if (name === 'band') {
                  const [lo, hi] = value as [number, number];
                  return [`${formatAZN(lo)} – ${formatAZN(hi)}`, 'Etibar diapazonu'];
                }
                return [formatAZN(Number(value)), name === 'projected' ? 'Proqnoz' : String(name)];
              }}
            />
            {/* Confidence band — shaded area between low and high */}
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="var(--brand-action)"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
            {/* Projected balance — line on top of the band */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke="var(--brand-action)"
              strokeWidth={2.5}
              dot={{ r: 5, fill: 'var(--brand-action)', strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
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

// REQ-FIN-06 — Firm-wide P&L: monthly income / expense / net
function PnLTable({
  incomes,
  expenses,
}: {
  incomes: Array<{ amount: number; occurred_at: string | null }>;
  expenses: Array<{ amount: number; occurred_at: string | null }>;
}) {
  const rows = byMonth(incomes, expenses);
  if (rows.length === 0) {
    return <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>Məlumat yoxdur.</div>;
  }
  const totIn = rows.reduce((s, r) => s + r.in, 0);
  const totOut = rows.reduce((s, r) => s + r.out, 0);
  return (
    <div className="card overflow-x-auto">
      <h3 className="text-h3 mb-3">Gəlir / Xərc / Xalis (aylıq)</h3>
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Ay', 'Gəlir', 'Xərc', 'Xalis'].map((h) => (
              <th key={h} className="text-left py-2 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const net = r.in - r.out;
            return (
              <tr key={r.m} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-2 px-3">{r.m}</td>
                <td className="py-2 px-3" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--success-deep)' }}>{formatAZN(r.in)}</td>
                <td className="py-2 px-3" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--error-deep)' }}>{formatAZN(r.out)}</td>
                <td className="py-2 px-3 font-medium" style={{ fontVariantNumeric: 'tabular-nums', color: net >= 0 ? 'var(--success-deep)' : 'var(--error-deep)' }}>{formatAZN(net)}</td>
              </tr>
            );
          })}
          <tr style={{ borderTop: '2px solid var(--line)' }}>
            <td className="py-2 px-3 font-medium">Cəmi</td>
            <td className="py-2 px-3 font-medium" style={{ color: 'var(--success-deep)' }}>{formatAZN(totIn)}</td>
            <td className="py-2 px-3 font-medium" style={{ color: 'var(--error-deep)' }}>{formatAZN(totOut)}</td>
            <td className="py-2 px-3 font-medium" style={{ color: totIn - totOut >= 0 ? 'var(--success-deep)' : 'var(--error-deep)' }}>{formatAZN(totIn - totOut)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// REQ-FIN-07 — Outsource cost summary by status
function OutsourceSummary() {
  const q = useQuery({
    queryKey: ['fin', 'outsource_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outsource_items')
        .select('id, work_title, contact_company, contact_person, amount, status, deadline')
        .order('deadline', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const byStatus: Record<string, { count: number; total: number }> = {};
  for (const r of rows) {
    const s = r.status ?? 'order';
    byStatus[s] ??= { count: 0, total: 0 };
    byStatus[s].count++;
    byStatus[s].total += Number(r.amount ?? 0);
  }

  const STATUS_LABEL: Record<string, string> = {
    order: 'Sifariş', in_progress: 'İcra', delivered: 'Təhvil', paid: 'Ödənildi',
  };

  return (
    <div className="space-y-4">
      {/* Status summary chips */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(byStatus).map(([s, v]) => (
          <div key={s} className="card px-4 py-3 min-w-[130px]">
            <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{STATUS_LABEL[s] ?? s}</div>
            <div className="text-h2 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(v.total)}</div>
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{v.count} sifariş</div>
          </div>
        ))}
        {rows.length === 0 ? <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Outsource sifarişi yoxdur.</div> : null}
      </div>
      {/* Detail table */}
      {rows.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Şirkət', 'İş', 'Məbləğ', 'Status', 'Müddət'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-2 px-3">{r.contact_company ?? r.contact_person ?? '—'}</td>
                  <td className="py-2 px-3 max-w-[200px] truncate">{r.work_title ?? '—'}</td>
                  <td className="py-2 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.amount ?? 0)}</td>
                  <td className="py-2 px-3"><span className="chip text-meta" style={{ padding: '2px 6px', fontSize: 11 }}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  <td className="py-2 px-3">{r.deadline ? formatDate(r.deadline) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
