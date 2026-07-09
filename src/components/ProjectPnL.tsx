/**
 * Project P&L — REQ-FIN-06 + Project Finance 2.0 (owner spec 2026-07-06).
 *
 * Surfaces, top to bottom:
 *   • Contract card    — müqavilə dəyəri (net + ƏDV-li), alınıb / qalıq, progress.
 *   • Stat row         — alınmış ödəniş, birbaşa xərc, xalis (cash).
 *   • Detailed P&L     — payments / expenses / outsource (paid + öhdəlik) / net.
 *   • Subcontractors   — bu layihəyə bağlı podratçılar, ödənilib / öhdəlik.
 *   • Expense-by-cat   — operativ xərclərin kateqoriya bölgüsü.
 *
 * Admin-only surface (parent gates with isAdmin); each underlying table has
 * admin-only RLS so a non-admin call returns empty rows anyway.
 *
 * Outsource money reads the outsource_payments milestones (source of truth),
 * falling back to outsource_items.amount for legacy items with no payment rows —
 * so the P&L matches what's actually recorded in the Podrat İşləri module.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { formatAZN, formatDate } from '@/lib/format';
import { grossFromNet, PAYMENT_KIND_LABEL, type PaymentKind } from '@/lib/labels';
import { IncomeExpenseModal, type FinanceKind, type FinanceEditRow } from '@/components/IncomeExpenseModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Props = { projectId: string };

type Row = { amount: number; occurred_at?: string | null; paid_at?: string | null };

type IncomeRow = Row & {
  id: string;
  occurred_at: string;
  payment_kind: PaymentKind | null;
  payment_method: string | null;
  invoice_number: string | null;
  note: string | null;
  client_id: string | null;
  vat_included: boolean | null;
  vat_rate: number | null;
};
type ExpenseRow = Row & {
  id: string;
  occurred_at: string;
  category: string | null;
  vendor: string | null;
  note: string | null;
};

export function ProjectPnL({ projectId }: Props) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  // Edit / delete of individual saved entries (owner request 2026-07-16).
  const [editTx, setEditTx] = useState<{ kind: FinanceKind; row: FinanceEditRow } | null>(null);
  const [deleteTx, setDeleteTx] = useState<{ kind: FinanceKind; id: string; amount: number } | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (t: { kind: FinanceKind; id: string }) => {
      const { error } = await supabase
        .from(t.kind === 'income' ? 'incomes' : 'expenses')
        .delete()
        .eq('id', t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pnl'] });
      qc.invalidateQueries({ queryKey: ['fin'] });
      setDeleteTx(null);
    },
  });

  // Contract value (0087) + budget (0048) live on the project row.
  const project = useQuery({
    queryKey: ['pnl', 'project', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('budget_amount, contract_value_net, vat_rate')
        .eq('id', projectId)
        .maybeSingle();
      return data as {
        budget_amount: number | null;
        contract_value_net: number | null;
        vat_rate: number | null;
      } | null;
    },
  });

  const incomes = useQuery({
    queryKey: ['pnl', 'incomes', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incomes')
        .select('id, amount, occurred_at, payment_kind, payment_method, invoice_number, note, client_id, vat_included, vat_rate')
        .eq('project_id', projectId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as IncomeRow[];
    },
  });
  const expenses = useQuery({
    queryKey: ['pnl', 'expenses', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, occurred_at, category, vendor, note')
        .eq('project_id', projectId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });
  // Subcontractor jobs on this project (for the list + committed fallback).
  const outsourceItems = useQuery({
    queryKey: ['pnl', 'outsource-items', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outsource_items')
        .select('id, work_title, contact_company, contact_person, amount, status')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        work_title: string | null;
        contact_company: string | null;
        contact_person: string | null;
        amount: number | null;
        status: string;
      }>;
    },
  });
  // Saved overhead snapshots (Rentabellik calculator) — cumulative net profit.
  const overhead = useQuery({
    queryKey: ['pnl', 'overhead', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_overhead_allocations')
        .select('overhead_amount, period_month')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data ?? []) as Array<{ overhead_amount: number; period_month: string }>;
    },
  });

  // Payment milestones for this project's items (source of truth for money).
  const outsourcePayments = useQuery({
    queryKey: ['pnl', 'outsource-payments', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outsource_payments')
        .select('outsource_item_id, amount, is_paid, outsource_items!inner(project_id)')
        .eq('outsource_items.project_id', projectId);
      if (error) throw error;
      return (data ?? []) as Array<{ outsource_item_id: string; amount: number; is_paid: boolean }>;
    },
  });

  const incomeTotal = sum(incomes.data ?? []);
  const expenseTotal = sum(expenses.data ?? []);

  // Per-item paid / committed from milestones, falling back to item.amount when
  // an item has no payment rows (legacy). Aggregated for the project totals AND
  // reused for the per-subcontractor grouping below.
  const { outsourcePaid, outsourceCommitted, subcontractors } = useMemo(() => {
    const payByItem = new Map<string, { paid: number; committed: number; count: number }>();
    for (const p of outsourcePayments.data ?? []) {
      const cur = payByItem.get(p.outsource_item_id) ?? { paid: 0, committed: 0, count: 0 };
      cur.committed += Number(p.amount ?? 0);
      if (p.is_paid) cur.paid += Number(p.amount ?? 0);
      cur.count += 1;
      payByItem.set(p.outsource_item_id, cur);
    }
    let paid = 0;
    let committed = 0;
    const byCompany = new Map<string, { paid: number; committed: number; jobs: number }>();
    for (const item of outsourceItems.data ?? []) {
      const pm = payByItem.get(item.id);
      const itemPaid = pm?.paid ?? 0;
      const itemCommitted = pm && pm.count > 0 ? pm.committed : Number(item.amount ?? 0);
      paid += itemPaid;
      committed += itemCommitted;
      const company = item.contact_company?.trim() || item.contact_person?.trim() || '—';
      const g = byCompany.get(company) ?? { paid: 0, committed: 0, jobs: 0 };
      g.paid += itemPaid;
      g.committed += itemCommitted;
      g.jobs += 1;
      byCompany.set(company, g);
    }
    return {
      outsourcePaid: paid,
      outsourceCommitted: committed,
      subcontractors: [...byCompany.entries()]
        .map(([company, v]) => ({ company, ...v }))
        .sort((a, b) => b.committed - a.committed),
    };
  }, [outsourcePayments.data, outsourceItems.data]);

  // REQ-FIN-06 — operative-expense breakdown by category, descending.
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses.data ?? []) {
      const key = (e.category ?? '').trim() || 'Kateqoriyasız';
      m.set(key, (m.get(key) ?? 0) + Number(e.amount ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses.data]);

  // Payment milestone breakdown (Avans / Ara / Yekun) for the received total.
  const byMilestone = useMemo(() => {
    const m = new Map<PaymentKind, number>();
    for (const i of incomes.data ?? []) {
      if (i.payment_kind) m.set(i.payment_kind, (m.get(i.payment_kind) ?? 0) + Number(i.amount ?? 0));
    }
    return m;
  }, [incomes.data]);

  // Received split by payment method — makes cash (nağd) vs bank visible, since
  // some projects are settled in cash. Descending, cash first when tied.
  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of incomes.data ?? []) {
      const key = (i.payment_method ?? '').trim() || 'Digər';
      m.set(key, (m.get(key) ?? 0) + Number(i.amount ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [incomes.data]);

  // All saved entries newest-first — the editable drill-down of the P&L sums.
  const transactions = useMemo(() => {
    const t: Array<{
      kind: FinanceKind;
      date: string;
      amount: number;
      detail: string;
      note: string | null;
      row: IncomeRow | ExpenseRow;
    }> = [];
    for (const i of incomes.data ?? []) {
      t.push({
        kind: 'income',
        date: i.occurred_at,
        amount: Number(i.amount ?? 0),
        detail: [
          i.payment_method,
          i.payment_kind ? PAYMENT_KIND_LABEL[i.payment_kind] : null,
          i.vat_included ? `ƏDV ${i.vat_rate ?? 18}%` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        note: i.note,
        row: i,
      });
    }
    for (const e of expenses.data ?? []) {
      t.push({
        kind: 'expense',
        date: e.occurred_at,
        amount: Number(e.amount ?? 0),
        detail: [e.category, e.vendor].filter(Boolean).join(' · '),
        note: e.note,
        row: e,
      });
    }
    return t.sort((a, b) => b.date.localeCompare(a.date));
  }, [incomes.data, expenses.data]);

  const direct = expenseTotal + outsourcePaid;
  const net = incomeTotal - direct;
  const netCommitted = incomeTotal - expenseTotal - outsourceCommitted;

  // Net profit (ƏDV-siz): revenue net of VAT − direct costs − allocated overhead.
  // Per-payment (0088): only ƏDV-li payments get divided; cash payments without
  // VAT count in full. Rows missing a rate fall back to the project's rate.
  const projectVat = project.data?.vat_rate ?? 18;
  const incomeNet = (incomes.data ?? []).reduce((s, i) => {
    const amt = Number(i.amount ?? 0);
    if (!i.vat_included) return s + amt;
    const rate = i.vat_rate ?? projectVat;
    return s + amt / (1 + rate / 100);
  }, 0);
  const overheadTotal = (overhead.data ?? []).reduce((s, r) => s + Number(r.overhead_amount ?? 0), 0);
  const overheadMonths = overhead.data?.length ?? 0;
  const netProfit = incomeNet - direct - overheadTotal;

  const loading =
    incomes.isLoading || expenses.isLoading || outsourceItems.isLoading || outsourcePayments.isLoading;

  const budget = project.data?.budget_amount ?? null;
  const budgetUsedPct = budget && budget > 0 ? Math.round((direct / budget) * 100) : null;

  const contractNet = project.data?.contract_value_net ?? null;
  const vatRate = project.data?.vat_rate ?? 18;
  const contractGross = grossFromNet(contractNet, vatRate);
  const remaining = contractGross != null ? Math.max(0, contractGross - incomeTotal) : null;
  const receivedPct =
    contractGross && contractGross > 0 ? Math.round((incomeTotal / contractGross) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Contract value + payment progress (0087) */}
      {contractNet != null ? (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Müqavilə dəyəri
            </span>
            <span className="text-meta" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              ƏDV-siz {formatAZN(contractNet)} · ƏDV {vatRate}%
            </span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
            <span className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {contractGross != null ? formatAZN(contractGross) : '—'}
              <span className="text-meta ml-1" style={{ color: 'var(--text-muted)' }}>ƏDV-li</span>
            </span>
            <span className="text-body" style={{ fontVariantNumeric: 'tabular-nums' }}>
              Alınıb <strong style={{ color: 'var(--brand-text)' }}>{formatAZN(incomeTotal)}</strong>
              {remaining != null ? (
                <> · Qalıq <strong style={{ color: remaining > 0 ? 'var(--warning, #c47d00)' : '#15803D' }}>{formatAZN(remaining)}</strong></>
              ) : null}
            </span>
          </div>
          {receivedPct != null ? (
            <div style={{ height: 8, background: 'var(--line)', borderRadius: 999 }}>
              <div
                style={{
                  width: `${Math.min(100, receivedPct)}%`,
                  height: '100%',
                  background: receivedPct >= 100 ? '#15803D' : 'var(--brand-action)',
                  borderRadius: 999,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          ) : null}
          {byMilestone.size > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {[...byMilestone.entries()].map(([k, v]) => (
                <span key={k} className="chip text-meta" style={{ background: 'var(--surface-mist)' }}>
                  {PAYMENT_KIND_LABEL[k]}: {formatAZN(v)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Alınmış ödəniş" value={formatAZN(incomeTotal)} accent />
        <Stat label="Birbaşa xərc" value={formatAZN(direct)} />
        <Stat label="Xalis (cash)" value={formatAZN(net)} tone={net >= 0 ? 'positive' : 'negative'} />
      </div>

      {/* Received split by payment method — cash (nağd) made visible */}
      {byMethod.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Ödəniş üsulu:</span>
          {byMethod.map(([method, amt]) => {
            const isCash = method === 'Nağd';
            return (
              <span
                key={method}
                className="chip text-meta"
                style={{
                  background: isCash ? 'var(--brand-mist)' : 'var(--surface-mist)',
                  color: isCash ? 'var(--brand-text)' : 'var(--text)',
                  fontWeight: isCash ? 600 : 400,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {isCash ? '💵 ' : ''}{method}: {formatAZN(amt)}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* PRD §REQ-FIN-06 — budget vs actual progress bar */}
      {budget != null ? (
        <div className="card">
          <div className="flex items-center justify-between mb-2 text-meta">
            <span style={{ color: 'var(--text-muted)' }}>Büdcə vs faktiki</span>
            <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {formatAZN(direct)} / {formatAZN(budget)} ({budgetUsedPct ?? 0}%)
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--line)', borderRadius: 999 }}>
            <div
              style={{
                width: `${Math.min(100, budgetUsedPct ?? 0)}%`,
                height: '100%',
                background:
                  (budgetUsedPct ?? 0) > 100 ? 'var(--error-deep, #b3261e)'
                  : (budgetUsedPct ?? 0) > 80 ? '#c47d00'
                  : 'var(--brand-action)',
                borderRadius: 999,
                transition: 'width 0.3s',
              }}
            />
          </div>
          {(budgetUsedPct ?? 0) > 100 ? (
            <p className="text-meta mt-2" style={{ color: 'var(--error-deep)' }}>
              ⚠ Büdcə {(budgetUsedPct ?? 0) - 100}% aşılıb.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h3 className="text-h3 mb-3">Detallı bölgü</h3>
        {loading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Maddə', 'Sayğac', 'Məbləğ'].map((h) => (
                  <th
                    key={h}
                    className="text-meta text-left py-2 px-3"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PnLRow label="Ödəniş (alınıb)" count={incomes.data?.length ?? 0} amount={incomeTotal} />
              <PnLRow label="Xərc (operativ)" count={expenses.data?.length ?? 0} amount={expenseTotal} negative />
              <PnLRow
                label="Podratçı (ödənilib)"
                count={outsourceItems.data?.length ?? 0}
                amount={outsourcePaid}
                negative
              />
              <PnLRow label="Podratçı (öhdəlik)" count={subcontractors.length} amount={outsourceCommitted} muted />
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
          "Öhdəlik" sırası ödənilməmiş podratçı ödənişlərini də daxil edir — forecast üçün konservativ baxış.
        </p>
      </div>

      {/* Individual saved entries — editable drill-down of the sums above */}
      {!loading && transactions.length > 0 ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <h3 className="text-h3 mb-3">Əməliyyatlar</h3>
          <table className="w-full text-body" style={{ minWidth: isAdmin ? 640 : 520 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Tarix', 'Növ', 'Detal', 'Məbləğ', ...(isAdmin ? [''] : [])].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="text-meta py-2 px-3"
                    style={{
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      textAlign: h === 'Məbləğ' ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={`${t.kind}-${t.row.id}`} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDate(t.date)}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className="chip text-meta"
                      style={{
                        background: t.kind === 'income' ? 'var(--brand-mist)' : 'var(--surface-mist)',
                        color: t.kind === 'income' ? 'var(--brand-text)' : 'var(--text)',
                      }}
                    >
                      {t.kind === 'income' ? 'Ödəniş' : 'Xərc'}
                    </span>
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text)' }}>
                    {t.detail || '—'}
                    {t.note ? (
                      <span className="text-meta" style={{ color: 'var(--text-muted)' }}> · {t.note.length > 60 ? `${t.note.slice(0, 60)}…` : t.note}</span>
                    ) : null}
                  </td>
                  <td
                    className="py-2 px-3 text-right"
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: t.kind === 'income' ? '#15803D' : 'var(--error-deep)',
                      fontWeight: 500,
                    }}
                  >
                    {t.kind === 'income' ? '+' : '−'}{formatAZN(t.amount).replace(/^−|^-/, '')}
                  </td>
                  {isAdmin ? (
                    <td className="py-2 px-3 text-right" style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="chip"
                        aria-label="Düzəlt"
                        style={{ height: 24, padding: '0 8px', fontSize: 12 }}
                        onClick={() =>
                          setEditTx({
                            kind: t.kind,
                            row: { ...t.row, project_id: projectId } as FinanceEditRow,
                          })
                        }
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="chip"
                        aria-label="Sil"
                        style={{ height: 24, padding: '0 8px', fontSize: 12, marginLeft: 6, color: 'var(--error-deep)' }}
                        onClick={() => setDeleteTx({ kind: t.kind, id: t.row.id, amount: t.amount })}
                      >
                        🗑
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editTx ? (
        <IncomeExpenseModal
          kind={editTx.kind}
          editRow={editTx.row}
          incomeNoun="Ödəniş"
          onClose={() => setEditTx(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleteTx}
        title={deleteTx?.kind === 'income' ? 'Ödənişi sil?' : 'Xərci sil?'}
        body={deleteTx ? `${formatAZN(deleteTx.amount)} məbləğində qeyd silinəcək. Bu əməliyyat geri qaytarıla bilməz.` : undefined}
        confirmLabel="Sil"
        busy={deleteMutation.isPending}
        onConfirm={() => { if (deleteTx) deleteMutation.mutate(deleteTx); }}
        onCancel={() => setDeleteTx(null)}
      />

      {/* Net profit incl. allocated overhead (0087, Rentabellik snapshots) */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Net profit (overhead ilə)
            </span>
            <div className="text-h2 mt-1" style={{ color: netProfit >= 0 ? '#15803D' : 'var(--error-deep)', fontVariantNumeric: 'tabular-nums' }}>
              {formatAZN(netProfit)}
            </div>
          </div>
          <div className="text-meta text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            <div>Gəlir (ƏDV-siz): {formatAZN(incomeNet)}</div>
            <div>Birbaşa xərc: −{formatAZN(direct).replace(/^−|^-/, '')}</div>
            <div>Overhead ({overheadMonths} ay): −{formatAZN(overheadTotal).replace(/^−|^-/, '')}</div>
          </div>
        </div>
        {overheadMonths === 0 ? (
          <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
            Overhead hələ bölünməyib — "Maliyyə Mərkəzi → Rentabellik" bölməsində ayları böl ki, maaş/ofis payı bura düşsün.
          </p>
        ) : null}
      </div>

      {/* Subcontractors on this project (0087) */}
      {!loading && subcontractors.length > 0 ? (
        <div className="card">
          <h3 className="text-h3 mb-3">Podratçılar</h3>
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Podratçı', 'İş', 'Ödənilib', 'Öhdəlik'].map((h, i) => (
                  <th
                    key={h}
                    className="text-meta py-2 px-3"
                    style={{
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      textAlign: i >= 2 ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subcontractors.map((s) => (
                <tr key={s.company} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text)' }}>{s.company}</td>
                  <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>{s.jobs}</td>
                  <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                    {formatAZN(s.paid)}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                    {formatAZN(s.committed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* REQ-FIN-06 — operative-expense breakdown by category */}
      {!loading && byCategory.length > 0 ? (
        <div className="card">
          <h3 className="text-h3 mb-3">Xərc kateqoriyaları</h3>
          <ul className="space-y-2">
            {byCategory.map(([cat, amount]) => {
              const pct = expenseTotal > 0 ? Math.round((amount / expenseTotal) * 100) : 0;
              return (
                <li key={cat}>
                  <div className="flex items-center justify-between text-body">
                    <span style={{ color: 'var(--text)' }}>{cat}</span>
                    <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(amount)} · {pct}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--line)', borderRadius: 999, marginTop: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-action)', borderRadius: 999 }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
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
      <td className="py-2 px-3" style={{ color: muted ? 'var(--text-muted)' : 'var(--text)' }}>{label}</td>
      <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count}</td>
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
      <span className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-h2 mt-1" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function sum(rows: Array<{ amount: number | string | null }>): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}
