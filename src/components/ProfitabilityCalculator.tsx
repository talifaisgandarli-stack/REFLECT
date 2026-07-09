/**
 * Rentabellik — overhead allocation + net profit calculator (owner spec
 * 2026-07-06, migration 0087).
 *
 * The problem: salaries + office costs aren't tied to one project, so with
 * several projects running in parallel the admin needs to DECIDE how to split
 * that shared overhead to see each project's real net profit.
 *
 * How it works, for a chosen month:
 *   • Overhead pool = active AZN salaries + general expenses (layihəsiz).
 *   • Each active project gets an editable % of that pool. Default = share of
 *     contract value (ƏDV-siz); the admin overrides freely ("manual" part).
 *   • Per project the month's net = payments received (ƏDV-siz) − direct costs
 *     − paid subcontractors − allocated overhead.
 *   • Saving snapshots the AZN overhead per project (project_overhead_allocations)
 *     so the project page shows a stable cumulative net profit.
 *
 * Admin-only (RLS on every source table returns empty for members anyway).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';
import { formatAZN } from '@/lib/format';

type ActiveProject = {
  id: string;
  name: string;
  contract_value_net: number | null;
  vat_rate: number | null;
  start_date: string | null;
  deadline: string | null;
  status: string;
};

function monthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, nextStart: `${next}-01` };
}

// Default current month (Baku); computed once from the render clock.
function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ProfitabilityCalculator() {
  const qc = useQueryClient();
  const [ym, setYm] = useState(currentYm);
  const { start, nextStart } = monthBounds(ym);

  // Salaries are effective-dated ranges; fetch all (small) and filter in-month.
  const salaries = useQuery({
    queryKey: ['rent', 'salaries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('salaries')
        .select('amount, currency, effective_from, effective_to');
      return (data ?? []) as Array<{
        amount: number;
        currency: string;
        effective_from: string;
        effective_to: string | null;
      }>;
    },
  });

  // General (layihəsiz) expenses in the month = office / firm-wide overhead.
  const generalExpenses = useQuery({
    queryKey: ['rent', 'general-expenses', start],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('amount, category')
        .is('project_id', null)
        .gte('occurred_at', start)
        .lt('occurred_at', nextStart);
      return (data ?? []) as Array<{ amount: number; category: string | null }>;
    },
  });

  const projects = useQuery({
    queryKey: ['rent', 'projects'],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, contract_value_net, vat_rate, start_date, deadline, status')
        .is('archived_at', null);
      return (data ?? []) as ActiveProject[];
    },
  });

  // Per-project money IN and OUT for the month.
  const monthIncomes = useQuery({
    queryKey: ['rent', 'incomes', start],
    queryFn: async () => {
      const { data } = await supabase
        .from('incomes')
        .select('project_id, amount, vat_included, vat_rate')
        .gte('occurred_at', start)
        .lt('occurred_at', nextStart);
      return (data ?? []) as Array<{
        project_id: string | null;
        amount: number;
        vat_included: boolean | null;
        vat_rate: number | null;
      }>;
    },
  });
  const monthDirectExpenses = useQuery({
    queryKey: ['rent', 'direct-expenses', start],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('project_id, amount')
        .not('project_id', 'is', null)
        .gte('occurred_at', start)
        .lt('occurred_at', nextStart);
      return (data ?? []) as Array<{ project_id: string; amount: number }>;
    },
  });
  const monthOutsource = useQuery({
    queryKey: ['rent', 'outsource', start],
    queryFn: async () => {
      const { data } = await supabase
        .from('outsource_payments')
        .select('amount, paid_at, outsource_items!inner(project_id)')
        .eq('is_paid', true)
        .gte('paid_at', start)
        .lt('paid_at', nextStart);
      // PostgREST returns the to-one embed as an object at runtime, but the
      // generated types widen it to an array — normalize below.
      return (data ?? []) as unknown as Array<{
        amount: number;
        outsource_items: { project_id: string | null } | Array<{ project_id: string | null }>;
      }>;
    },
  });
  const savedAllocations = useQuery({
    queryKey: ['rent', 'allocations', start],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_overhead_allocations')
        .select('project_id, percent, locked')
        .eq('period_month', start);
      return (data ?? []) as Array<{ project_id: string; percent: number; locked: boolean }>;
    },
  });

  // Overhead pool (AZN only; USD/EUR salaries are out of scope for now).
  const salaryPool = useMemo(() => {
    let s = 0;
    let nonAzn = false;
    for (const r of salaries.data ?? []) {
      const active = r.effective_from < nextStart && (r.effective_to == null || r.effective_to >= start);
      if (!active) continue;
      if (r.currency && r.currency !== 'AZN') { nonAzn = true; continue; }
      s += Number(r.amount ?? 0);
    }
    return { total: s, nonAzn };
  }, [salaries.data, start, nextStart]);
  const officePool = useMemo(
    () => (generalExpenses.data ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0),
    [generalExpenses.data],
  );
  const pool = salaryPool.total + officePool;

  // Active projects this month = overlaps [start, nextStart) and not closed.
  const activeProjects = useMemo(() => {
    return (projects.data ?? []).filter((p) => {
      if (p.status === 'closed' || p.status === 'cancelled') return false;
      const startsBeforeEnd = !p.start_date || p.start_date < nextStart;
      const endsAfterStart = !p.deadline || p.deadline >= start;
      return startsBeforeEnd && endsAfterStart;
    });
  }, [projects.data, start, nextStart]);

  // Net (ƏDV-siz) income per project — per-payment VAT (0088): ƏDV-li rows are
  // divided by their own rate (fallback: the project's rate), cash rows count
  // in full.
  const incomeNetByProject = useMemo(() => {
    const rateByProject = new Map((projects.data ?? []).map((p) => [p.id, p.vat_rate ?? 18]));
    const m = new Map<string, number>();
    for (const r of monthIncomes.data ?? []) {
      if (!r.project_id) continue;
      const amt = Number(r.amount ?? 0);
      const net = r.vat_included ? amt / (1 + (r.vat_rate ?? rateByProject.get(r.project_id) ?? 18) / 100) : amt;
      m.set(r.project_id, (m.get(r.project_id) ?? 0) + net);
    }
    return m;
  }, [monthIncomes.data, projects.data]);
  const expenseByProject = useMemo(() => groupSum(monthDirectExpenses.data ?? [], 'project_id'), [monthDirectExpenses.data]);
  const outsourceByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of monthOutsource.data ?? []) {
      const oi = Array.isArray(r.outsource_items) ? r.outsource_items[0] : r.outsource_items;
      const pid = oi?.project_id;
      if (pid) m.set(pid, (m.get(pid) ?? 0) + Number(r.amount ?? 0));
    }
    return m;
  }, [monthOutsource.data]);

  // Editable % per project. Seed from saved allocations, else default by
  // contract-value share among active projects.
  const [percents, setPercents] = useState<Record<string, string>>({});
  const defaultPercents = useMemo(() => {
    const withValue = activeProjects.filter((p) => (p.contract_value_net ?? 0) > 0);
    const totalNet = withValue.reduce((s, p) => s + (p.contract_value_net ?? 0), 0);
    const out: Record<string, number> = {};
    if (totalNet > 0) {
      for (const p of activeProjects) out[p.id] = Math.round(((p.contract_value_net ?? 0) / totalNet) * 1000) / 10;
    } else if (activeProjects.length > 0) {
      const even = Math.round((100 / activeProjects.length) * 10) / 10;
      for (const p of activeProjects) out[p.id] = even;
    }
    return out;
  }, [activeProjects]);

  // Reseed inputs whenever the month or its saved data changes.
  useEffect(() => {
    if (savedAllocations.isLoading || projects.isLoading) return;
    const saved = new Map((savedAllocations.data ?? []).map((a) => [a.project_id, a.percent]));
    const next: Record<string, string> = {};
    for (const p of activeProjects) {
      const v = saved.has(p.id) ? saved.get(p.id)! : defaultPercents[p.id] ?? 0;
      next[p.id] = String(v);
    }
    setPercents(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, savedAllocations.data, projects.data]);

  const rows = activeProjects.map((p) => {
    const pct = Number(percents[p.id] ?? 0) || 0;
    const overhead = Math.round(pool * (pct / 100) * 100) / 100;
    const incomeNet = Math.round((incomeNetByProject.get(p.id) ?? 0) * 100) / 100;
    const direct = (expenseByProject.get(p.id) ?? 0) + (outsourceByProject.get(p.id) ?? 0);
    const net = Math.round((incomeNet - direct - overhead) * 100) / 100;
    return { p, pct, overhead, incomeNet, direct, net };
  });

  const allocatedPct = rows.reduce((s, r) => s + r.pct, 0);
  const allocatedOverhead = rows.reduce((s, r) => s + r.overhead, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const unallocatedPct = Math.round((100 - allocatedPct) * 10) / 10;

  const save = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r) => ({
        project_id: r.p.id,
        period_month: start,
        percent: r.pct,
        overhead_amount: r.overhead,
      }));
      if (payload.length === 0) return;
      const { error } = await supabase
        .from('project_overhead_allocations')
        .upsert(payload, { onConflict: 'project_id,period_month' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent', 'allocations', start] });
      qc.invalidateQueries({ queryKey: ['pnl'] });
      toast.success('Overhead bölgüsü yadda saxlanıldı');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setEven = () => {
    if (activeProjects.length === 0) return;
    const even = Math.round((100 / activeProjects.length) * 10) / 10;
    setPercents(Object.fromEntries(activeProjects.map((p) => [p.id, String(even)])));
  };
  const setByContract = () => {
    setPercents(Object.fromEntries(activeProjects.map((p) => [p.id, String(defaultPercents[p.id] ?? 0)])));
  };

  const loading =
    salaries.isLoading || generalExpenses.isLoading || projects.isLoading || monthIncomes.isLoading;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ay</span>
          <input type="month" className="input" value={ym} onChange={(e) => setYm(e.target.value || currentYm())} />
        </label>
        <button type="button" className="btn-outline text-meta" onClick={setByContract}>
          Müqavilə dəyərinə görə böl
        </button>
        <button type="button" className="btn-outline text-meta" onClick={setEven}>
          Bərabər böl
        </button>
        <button
          type="button"
          className="btn-primary"
          style={{ marginLeft: 'auto' }}
          onClick={() => save.mutate()}
          disabled={save.isPending || rows.length === 0}
        >
          {save.isPending ? 'Saxlanılır…' : 'Bölgünü yadda saxla'}
        </button>
      </div>

      {/* Overhead pool */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PoolStat label="Maaş fondu (aktiv, AZN)" value={formatAZN(salaryPool.total)} />
        <PoolStat label="Ofis / ümumi xərc" value={formatAZN(officePool)} />
        <PoolStat label="Overhead cəmi" value={formatAZN(pool)} accent />
      </div>
      {salaryPool.nonAzn ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Qeyd: AZN olmayan maaşlar (USD/EUR) hazırda overhead-ə daxil edilmir.
        </p>
      ) : null}

      {loading ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</p>
      ) : rows.length === 0 ? (
        <div className="card">
          <p className="text-body" style={{ color: 'var(--text-muted)' }}>Bu ay üçün aktiv layihə yoxdur.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="w-full text-body" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Layihə', 'Ödəniş (ƏDV-siz)', 'Birbaşa xərc', 'Overhead %', 'Overhead ₼', 'Net profit'].map((h, i) => (
                  <th
                    key={h}
                    className="text-meta py-2 px-3"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 0 ? 'left' : 'right' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text)' }}>{r.p.name}</td>
                  <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(r.incomeNet)}</td>
                  <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--error-deep)' }}>
                    −{formatAZN(r.direct).replace(/^−|^-/, '')}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      className="input"
                      style={{ width: 76, textAlign: 'right', fontVariantNumeric: 'tabular-nums', display: 'inline-block' }}
                      value={percents[r.p.id] ?? ''}
                      onChange={(e) => setPercents((prev) => ({ ...prev, [r.p.id]: e.target.value }))}
                    />
                  </td>
                  <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--error-deep)' }}>
                    −{formatAZN(r.overhead).replace(/^−|^-/, '')}
                  </td>
                  <td
                    className="py-2 px-3 text-right font-medium"
                    style={{ fontVariantNumeric: 'tabular-nums', color: r.net >= 0 ? '#15803D' : 'var(--error-deep)' }}
                  >
                    {formatAZN(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--line)' }}>
                <td className="py-3 px-3 font-medium">Cəm</td>
                <td className="py-3 px-3" />
                <td className="py-3 px-3" />
                <td
                  className="py-3 px-3 text-right font-medium"
                  style={{ fontVariantNumeric: 'tabular-nums', color: allocatedPct > 100 ? 'var(--error-deep)' : 'var(--text)' }}
                >
                  {allocatedPct.toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-right font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(allocatedOverhead)}
                </td>
                <td
                  className="py-3 px-3 text-right font-medium"
                  style={{ fontVariantNumeric: 'tabular-nums', color: totalNet >= 0 ? '#15803D' : 'var(--error-deep)' }}
                >
                  {formatAZN(totalNet)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="flex flex-wrap gap-4 mt-3 text-meta">
            <span style={{ color: unallocatedPct === 0 ? 'var(--text-muted)' : unallocatedPct < 0 ? 'var(--error-deep)' : 'var(--warning, #c47d00)' }}>
              {unallocatedPct === 0
                ? 'Overhead tam bölünüb (100%).'
                : unallocatedPct > 0
                  ? `Bölünməmiş: ${unallocatedPct}% (${formatAZN(Math.round(pool * (unallocatedPct / 100) * 100) / 100)})`
                  : `Həddindən artıq bölünüb: ${Math.abs(unallocatedPct)}%`}
            </span>
          </div>
        </div>
      )}

      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Net profit = alınan ödəniş (ƏDV-siz) − birbaşa xərc (operativ + podratçı) − overhead payı.
        Overhead = aktiv maaşlar + layihəsiz ofis xərcləri, sənin təyin etdiyin faizlə bölünür.
        Yadda saxladıqda hər layihənin payı snapshot olunur — sonradan maaş dəyişsə keçmiş ay dəyişmir.
      </p>
    </div>
  );
}

function PoolStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card flex flex-col">
      <span className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-h2 mt-1" style={{ color: accent ? 'var(--brand-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

function groupSum<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r[key] as string | null;
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + Number((r as { amount?: number }).amount ?? 0));
  }
  return m;
}
