/**
 * Hesabatlar (PRD §10.7) — admin reports.
 *  - 3 KPIs: aktiv layihələr / cari ay gəliri / komanda yükü
 *  - Phase distribution donut (active projects bucketed by latest phase)
 *  - Aylıq gəlir bar (last 6 months)
 *  - Capacity heatmap: assignee × week, total open task workload sum
 *
 * Hesabatlar is admin-only — RLS hides finance from non-admin anyway,
 * but we still gate the route so members don't see an empty shell.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { formatAZN } from '@/lib/format';
import { PROJECT_PHASES } from '@/lib/labels';
import { downloadCsv, printSection } from '@/lib/export';

const PHASE_COLOR = ['#ADFB49', '#5CA87C', '#1A5140', '#84A6FF', '#A78BFA', '#D97706'];

function monthBucket(iso: string): string {
  return iso.slice(0, 7);
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function isoWeek(d: Date): string {
  // YYYY-Www approximation good enough for grouping
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function ReportsPage() {
  const projects = useQuery({
    queryKey: ['reports', 'projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, phases, deadline')
        .is('archived_at', null);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        status: string;
        phases: string[];
        deadline: string | null;
      }>;
    },
  });

  const incomes = useQuery({
    queryKey: ['reports', 'incomes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incomes')
        .select('amount, occurred_at')
        .gte(
          'occurred_at',
          new Date(Date.now() - 200 * 86_400_000).toISOString(),
        );
      if (error) throw error;
      return (data ?? []) as Array<{ amount: number; occurred_at: string }>;
    },
  });

  const tasks = useQuery({
    queryKey: ['reports', 'tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, assignee_ids, deadline, workload, status')
        .is('archived_at', null)
        .not('status', 'in', '(done,cancelled)');
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        assignee_ids: string[];
        deadline: string | null;
        workload: number | null;
        status: string;
      }>;
    },
  });

  const profiles = useQuery({
    queryKey: ['reports', 'profiles'],
    queryFn: async () =>
      (await supabase.from('profiles').select('id, full_name, email').eq('is_active', true)).data ??
      [],
  });

  // Phase distribution: bucket each active project by its latest phase
  const phaseDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects.data ?? []) {
      if (p.status !== 'active') continue;
      const phase = (p.phases ?? []).slice(-1)[0] ?? 'Konsepsiya';
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    }
    return PROJECT_PHASES.map((p, i) => ({
      name: p,
      value: counts.get(p) ?? 0,
      color: PHASE_COLOR[i % PHASE_COLOR.length],
    })).filter((d) => d.value > 0);
  }, [projects.data]);

  const monthlyRevenue = useMemo(() => {
    const months = lastNMonths(6);
    const map = new Map(months.map((m) => [m, 0]));
    for (const r of incomes.data ?? []) {
      const k = monthBucket(r.occurred_at ?? '');
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + Number(r.amount));
    }
    return months.map((m) => ({ m, revenue: map.get(m) ?? 0 }));
  }, [incomes.data]);

  // Capacity heatmap: rows = members, columns = next 6 ISO weeks,
  // cell = sum(workload) across tasks assigned to that member with
  // deadline in that week.
  const heatmap = useMemo(() => {
    const weeks: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i * 7);
      weeks.push(isoWeek(d));
    }
    const memberMap = new Map<string, { name: string; cells: Record<string, number> }>();
    for (const p of (profiles.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string;
    }>) {
      memberMap.set(p.id, {
        name: p.full_name || p.email,
        cells: Object.fromEntries(weeks.map((w) => [w, 0])),
      });
    }
    for (const t of tasks.data ?? []) {
      if (!t.deadline) continue;
      const w = isoWeek(new Date(t.deadline));
      if (!weeks.includes(w)) continue;
      for (const uid of t.assignee_ids ?? []) {
        const row = memberMap.get(uid);
        if (!row) continue;
        row.cells[w] = (row.cells[w] ?? 0) + Number(t.workload ?? 0);
      }
    }
    const rows = Array.from(memberMap.values()).filter((r) =>
      Object.values(r.cells).some((v) => v > 0),
    );
    const max = Math.max(1, ...rows.flatMap((r) => Object.values(r.cells)));
    return { weeks, rows, max };
  }, [profiles.data, tasks.data]);

  const monthRevenueTotal = monthlyRevenue.at(-1)?.revenue ?? 0;
  const teamLoadTotal = useMemo(
    () => (tasks.data ?? []).reduce((s, t) => s + Number(t.workload ?? 0), 0),
    [tasks.data],
  );
  const activeCount = (projects.data ?? []).filter((p) => p.status === 'active').length;

  function exportCsv() {
    const headers = ['Bölmə', 'Açar', 'Dəyər'];
    const rows: Array<Array<unknown>> = [];
    rows.push(['KPI', 'Aktiv layihələr', activeCount]);
    rows.push(['KPI', 'Cari ay gəliri (AZN)', monthRevenueTotal]);
    rows.push(['KPI', 'Komanda yükü (saat)', Math.round(teamLoadTotal)]);
    for (const d of phaseDist) rows.push(['Faza paylanması', d.name, d.value]);
    for (const m of monthlyRevenue) rows.push(['Aylıq gəlir', m.m, m.revenue]);
    for (const r of heatmap.rows) {
      for (const w of heatmap.weeks) {
        const v = r.cells[w] ?? 0;
        if (v > 0) rows.push([`Heatmap · ${r.name}`, w, Math.round(v)]);
      }
    }
    downloadCsv(`reflect-hesabat-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  return (
    <>
      <PageHead
        meta="Admin yalnız"
        title="Hesabatlar"
        actions={
          <>
            <button className="btn-outline" onClick={exportCsv}>
              CSV / Excel
            </button>
            <button className="btn-outline" onClick={() => printSection()}>
              PDF (çap)
            </button>
          </>
        }
      />

      <div data-print-root>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Kpi label="Aktiv layihələr" value={activeCount.toString()} />
        <Kpi label="Cari ay gəliri" value={formatAZN(monthRevenueTotal)} accent />
        <Kpi
          label="Komanda yükü"
          value={`${Math.round(teamLoadTotal)} saat`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <section className="card">
          <h3 className="text-h3 mb-3">Faza paylanması</h3>
          {phaseDist.length === 0 ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Aktiv layihə yoxdur.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={phaseDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {phaseDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} layihə`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <ul className="grid grid-cols-2 gap-1 mt-2 text-meta">
            {phaseDist.map((d) => (
              <li key={d.name} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="w-2 h-2 rounded-full"
                  style={{ background: d.color }}
                />
                <span style={{ color: 'var(--text-soft)' }}>{d.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>· {d.value}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3 className="text-h3 mb-3">Aylıq gəlir (son 6 ay)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyRevenue}>
              <XAxis dataKey="m" stroke="#7A857F" />
              <YAxis stroke="#7A857F" />
              <Tooltip
                formatter={(value: number) => [formatAZN(value), 'Gəlir']}
                cursor={{ fill: 'rgba(173,251,73,0.08)' }}
              />
              <Bar dataKey="revenue" fill="#ADFB49" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card">
        <h3 className="text-h3 mb-3">Komanda tutumu (heatmap, gələn 6 həftə)</h3>
        {heatmap.rows.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Növbəti 6 həftə üçün açıq tapşırıq yoxdur.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-meta" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th
                    className="text-left py-2 pr-4"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    İşçi
                  </th>
                  {heatmap.weeks.map((w) => (
                    <th
                      key={w}
                      className="text-center px-2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {w.slice(-3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="pr-4 py-1 text-body" style={{ color: 'var(--text)' }}>
                      {r.name}
                    </td>
                    {heatmap.weeks.map((w) => {
                      const v = r.cells[w] ?? 0;
                      const intensity = v / heatmap.max;
                      return (
                        <td
                          key={w}
                          className="text-center"
                          style={{
                            background: `rgba(173,251,73,${(intensity * 0.7).toFixed(2)})`,
                            color: intensity > 0.5 ? 'var(--ink)' : 'var(--text-muted)',
                            padding: '6px 4px',
                            fontVariantNumeric: 'tabular-nums',
                            border: '1px solid var(--surface)',
                            borderRadius: 4,
                          }}
                          title={`${r.name} · ${w}: ${Math.round(v)} saat`}
                        >
                          {v > 0 ? Math.round(v) : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
          Hər xanada həmin işçinin o həftəsinə düşən tapşırıqların ümumi iş yükü (saat) göstərilir.
        </p>
      </section>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card flex flex-col">
      <span className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className="text-h1 mt-1"
        style={{
          color: accent ? 'var(--brand-text)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}
