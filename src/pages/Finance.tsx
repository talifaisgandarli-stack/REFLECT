import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { bakuMonthRange, formatAZN, formatDate } from '@/lib/format';
import {
  isOutsourcePaidAdminOnly,
  isOverpaymentError,
  useCreateExpense,
  useCreateIncome,
  useExpenses,
  useIncomes,
  useMarkReceivablePaid,
  useOutsourceItems,
  useProjectPnl,
  useReceivables,
  useUpdateOutsourceStatus,
} from '@/lib/hooks';
import type { CashForecastRow, Expense, Income, OutsourceItem, OutsourceStatus, Receivable } from '@/types/db';
import { useAuth } from '@/lib/store';
import { useProjects } from '@/lib/hooks';
import { useClients } from '@/lib/hooks';

const TABS = ['Cash Cockpit', 'P&L', 'Outsource', 'Xərclər', 'Debitor', 'Forecast'] as const;
type Tab = (typeof TABS)[number];

const PAYMENT_METHODS = ['Bank köçürməsi', 'Nağd', 'Kart', 'Digər'] as const;
const EXPENSE_CATEGORIES = ['Maaş', 'Ofis', 'Lisenziya', 'Marketinq', 'Outsource', 'Digər'] as const;

export function FinancePage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('Cash Cockpit');
  const [modal, setModal] = useState<'income' | 'expense' | null>(null);

  const range = useMemo(() => bakuMonthRange(), []);
  const monthIncomes = useIncomes(range);
  const monthExpenses = useExpenses(range);
  const allIncomes = useIncomes();
  const allExpenses = useExpenses();
  const receivables = useReceivables();
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

  if (!isAdmin) {
    return (
      <>
        <PageHead title="Maliyyə Mərkəzi" meta="Yalnız admin" />
        <div className="card text-meta">Bu modulu yalnız admin görə bilər.</div>
      </>
    );
  }

  const totalIn = (monthIncomes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = (monthExpenses.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const balance = totalIn - totalOut;
  const debt = (receivables.data ?? []).reduce(
    (s, r) => s + Math.max(0, Number(r.amount) - Number(r.paid_amount)),
    0,
  );

  return (
    <>
      <PageHead
        meta="Asia/Baku · cari ay"
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

      <div
        className="card mb-5 flex flex-wrap gap-6 sticky top-0 z-10"
        style={{ background: 'var(--surface)' }}
      >
        <Stat label="Cari balans" value={formatAZN(balance)} accent />
        <Stat label="Gəlir (cari ay)" value={formatAZN(totalIn)} />
        <Stat label="Xərc (cari ay)" value={formatAZN(totalOut)} />
        <Stat label="Debitor" value={formatAZN(debt)} />
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
        <CashflowChart incomes={allIncomes.data ?? []} expenses={allExpenses.data ?? []} />
      ) : null}

      {tab === 'Debitor' ? (
        <ReceivablesTable
          rows={receivables.data ?? []}
          loading={receivables.isLoading}
        />
      ) : null}

      {tab === 'Forecast' ? (
        <ForecastGrid rows={(forecasts.data ?? []) as CashForecastRow[]} />
      ) : null}

      {tab === 'Xərclər' ? (
        <ExpensesTable rows={allExpenses.data ?? []} loading={allExpenses.isLoading} />
      ) : null}

      {tab === 'Outsource' ? <OutsourceTab /> : null}

      {tab === 'P&L' ? <PnlTab /> : null}

      {modal === 'income' ? (
        <IncomeModal onClose={() => setModal(null)} />
      ) : null}
      {modal === 'expense' ? (
        <ExpenseModal onClose={() => setModal(null)} />
      ) : null}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="text-meta uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
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

function CashflowChart({ incomes, expenses }: { incomes: Income[]; expenses: Expense[] }) {
  const data = useMemo(() => byMonth(incomes, expenses), [incomes, expenses]);
  return (
    <div className="card" style={{ height: 320 }}>
      <h3 className="text-h3 mb-3">Aylıq cash flow</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis dataKey="m" stroke="#7A857F" />
          <YAxis stroke="#7A857F" />
          <Tooltip />
          <Bar dataKey="in" fill="#ADFB49" />
          <Bar dataKey="out" fill="#1A5140" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReceivablesTable({ rows, loading }: { rows: Receivable[]; loading: boolean }) {
  const { data: clients = [] } = useClients();
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—';
  const [paying, setPaying] = useState<Receivable | null>(null);

  if (loading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Debitor qeyd yoxdur.
      </div>
    );
  }

  return (
    <>
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
          {rows.map((r) => {
            const remaining = Number(r.amount) - Number(r.paid_amount);
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{clientName(r.client_id)}</td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(r.amount)}
                </td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(r.paid_amount)}
                </td>
                <td className="py-3 px-3">
                  <span className="chip">{r.status}</span>
                </td>
                <td className="py-3 px-3">{formatDate(r.due_at)}</td>
                <td className="py-3 px-3 text-right">
                  {remaining > 0 ? (
                    <button className="btn-outline" onClick={() => setPaying(r)}>
                      Ödəniş əlavə et
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {paying ? (
        <MarkPaidModal receivable={paying} onClose={() => setPaying(null)} />
      ) : null}
    </>
  );
}

function MarkPaidModal({
  receivable,
  onClose,
}: {
  receivable: Receivable;
  onClose: () => void;
}) {
  const remaining = Number(receivable.amount) - Number(receivable.paid_amount);
  const [delta, setDelta] = useState<string>(remaining.toString());
  const [err, setErr] = useState<string | null>(null);
  const mark = useMarkReceivablePaid();

  function submit() {
    setErr(null);
    const n = Number(delta);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Məbləğ 0-dan böyük olmalıdır.');
      return;
    }
    if (n > remaining) {
      setErr('Qalan borcu aşa bilməz.');
      return;
    }
    mark.mutate(
      { id: receivable.id, delta: n },
      {
        onSuccess: onClose,
        onError: (e) => {
          setErr(isOverpaymentError(e) ? 'Qalan borcu aşa bilməz.' : (e as Error).message);
        },
      },
    );
  }

  return (
    <Modal title="Ödəniş əlavə et" onClose={onClose}>
      <Field label="Qalıq">
        <div className="text-body">{formatAZN(remaining)}</div>
      </Field>
      <Field label="Ödəniş məbləği (AZN)">
        <input
          className="input w-full"
          type="number"
          min="0"
          step="0.01"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          autoFocus
        />
      </Field>
      {err ? <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>{err}</div> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Ləğv et
        </button>
        <button className="btn-primary" disabled={mark.isPending} onClick={submit}>
          {mark.isPending ? 'Yazılır…' : 'Təsdiqlə'}
        </button>
      </div>
    </Modal>
  );
}

function IncomeModal({ onClose }: { onClose: () => void }) {
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const create = useCreateIncome();
  const [amount, setAmount] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(today());
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Məbləğ 0-dan böyük olmalıdır.');
      return;
    }
    create.mutate(
      {
        amount: n,
        project_id: projectId || null,
        client_id: clientId || null,
        payment_method: method,
        occurred_at: new Date(date).toISOString(),
        invoice_number: invoice.trim() || null,
        note: note.trim() || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title="+ Gəlir" onClose={onClose}>
      <Field label="Məbləğ (AZN)">
        <input
          className="input w-full"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Layihə">
        <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— Seç —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Müştəri">
        <select className="input w-full" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— Seç —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ödəniş üsulu">
        <select className="input w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tarix">
        <input className="input w-full" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Faktura №">
        <input className="input w-full" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
      </Field>
      <Field label="Qeyd">
        <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {err ? <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>{err}</div> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Ləğv et
        </button>
        <button className="btn-primary" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'Yazılır…' : 'Yadda saxla'}
        </button>
      </div>
    </Modal>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { data: projects = [] } = useProjects();
  const create = useCreateExpense();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [vendor, setVendor] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Məbləğ 0-dan böyük olmalıdır.');
      return;
    }
    create.mutate(
      {
        amount: n,
        category,
        vendor: vendor.trim() || null,
        project_id: projectId || null,
        occurred_at: new Date(date).toISOString(),
        note: note.trim() || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title="+ Xərc" onClose={onClose}>
      <Field label="Məbləğ (AZN)">
        <input
          className="input w-full"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Kateqoriya">
        <select className="input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tərəf-müqabil">
        <input className="input w-full" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      </Field>
      <Field label="Layihə">
        <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— Seç —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tarix">
        <input className="input w-full" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Qeyd">
        <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {err ? <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>{err}</div> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Ləğv et
        </button>
        <button className="btn-primary" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'Yazılır…' : 'Yadda saxla'}
        </button>
      </div>
    </Modal>
  );
}

function ExpensesTable({ rows, loading }: { rows: Expense[]; loading: boolean }) {
  if (loading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Xərc qeydi yoxdur.
      </div>
    );
  }
  return (
    <table className="w-full text-body">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          {['Tarix', 'Kateqoriya', 'Tərəf-müqabil', 'Məbləğ'].map((h) => (
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
        {rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <td className="py-3 px-3">{formatDate(r.occurred_at)}</td>
            <td className="py-3 px-3">{r.category ?? '—'}</td>
            <td className="py-3 px-3">{r.vendor ?? '—'}</td>
            <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatAZN(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PnlTab() {
  const { data: rows = [], isLoading } = useProjectPnl();
  if (isLoading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Aktiv layihə yoxdur — P&L hesablanmır.
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Layihə', 'Gəlir', 'Xərc', 'Outsource', 'Net'].map((h) => (
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
          {rows.map((r) => (
            <tr key={r.project_id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <td className="py-3 px-3">{r.project_name}</td>
              <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatAZN(r.income)}
              </td>
              <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatAZN(r.expenses)}
              </td>
              <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatAZN(r.outsource)}
              </td>
              <td
                className="py-3 px-3"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: r.net >= 0 ? 'var(--brand-text)' : 'var(--danger, #B91C1C)',
                  fontWeight: 600,
                }}
              >
                {formatAZN(r.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const OUTSOURCE_LABEL: Record<OutsourceStatus, string> = {
  order: 'Sifariş',
  in_progress: 'İcrada',
  delivered: 'Təhvil',
  paid: 'Ödənildi',
};
const OUTSOURCE_FLOW: OutsourceStatus[] = ['order', 'in_progress', 'delivered', 'paid'];

function OutsourceTab() {
  const { data: rows = [], isLoading } = useOutsourceItems();
  const update = useUpdateOutsourceStatus();
  const [err, setErr] = useState<string | null>(null);

  function advance(row: OutsourceItem) {
    setErr(null);
    const next = OUTSOURCE_FLOW[OUTSOURCE_FLOW.indexOf(row.status) + 1];
    if (!next) return;
    update.mutate(
      { id: row.id, status: next },
      {
        onError: (e) =>
          setErr(
            isOutsourcePaidAdminOnly(e)
              ? 'Yalnız admin "Ödənildi" qoya bilər.'
              : (e as Error).message,
          ),
      },
    );
  }

  if (isLoading) return <div className="card text-meta">Yüklənir…</div>;
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Podrat işi yoxdur.
      </div>
    );
  }

  return (
    <>
      {err ? (
        <div className="card mb-3 text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
          {err}
        </div>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['İş', 'Layihə', 'Deadline', 'Status', 'Məbləğ', ''].map((h, i) => (
                <th
                  key={`${h}-${i}`}
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
            {rows.map((row) => {
              const next = OUTSOURCE_FLOW[OUTSOURCE_FLOW.indexOf(row.status) + 1];
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{row.work_title}</td>
                  <td className="py-3 px-3">{row.project_id ?? '—'}</td>
                  <td className="py-3 px-3">{formatDate(row.deadline)}</td>
                  <td className="py-3 px-3">
                    <span className="chip">{OUTSOURCE_LABEL[row.status]}</span>
                  </td>
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(row.amount)}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {next ? (
                      <button
                        className="btn-outline"
                        disabled={update.isPending}
                        onClick={() => advance(row)}
                      >
                        → {OUTSOURCE_LABEL[next]}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ForecastGrid({ rows }: { rows: CashForecastRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Forecast hələ qurulmayıb. /api/cron/forecast cron-u işə düşəndən sonra görünəcək.
      </div>
    );
  }
  // Show only the latest run (top 3 rows are the most recent generated_at).
  const latest = rows.slice(0, 3).sort((a, b) => a.horizon_days - b.horizon_days);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {latest.map((f) => (
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
        ))}
      </div>
      <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
        Bu proqnoz MIRAI Maliyyə Analitiki tərəfindən tarixi gəlir/xərc məlumatları
        əsasında hesablanır. Real nəticələr fərqli ola bilər — qərar vermə üçün
        yalnız istinad mənbəyi kimi istifadə edin.
      </p>
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[460px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function byMonth(ins: Income[], outs: Expense[]) {
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
