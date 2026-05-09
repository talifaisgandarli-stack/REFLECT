/**
 * MIRAI cost dashboard (PRD §7.6, §7.9) — admin only.
 *
 * Reads mirai_usage_log directly. Each user has at most one row per
 * period_yyyymm so the join is light. Surfaces:
 *   - per-user spend in the current month with cap and warn-tone
 *   - 6-month total spend bar
 *   - top consumers table for the month
 *
 * Cost guardian decisions live server-side (api/mirai/{chat,stream}.ts);
 * this page is read-only telemetry.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';

type UsageRow = {
  user_id: string;
  period_yyyymm: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
};

const CAP_USD = 5;
const WARN_PCT = 0.8;

function periodLabel(yyyymm: number): string {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function currentPeriod(): number {
  const d = new Date();
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

export function MiraiCostPage() {
  const usage = useQuery({
    queryKey: ['mirai-usage'],
    queryFn: async (): Promise<UsageRow[]> => {
      const { data, error } = await supabase
        .from('mirai_usage_log')
        .select('user_id, period_yyyymm, tokens_in, tokens_out, cost_usd')
        .order('period_yyyymm', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const profiles = useQuery({
    queryKey: ['mirai-usage', 'profiles'],
    queryFn: async () =>
      ((await supabase.from('profiles').select('id, full_name, email')).data ?? []) as ProfileRow[],
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    for (const p of profiles.data ?? []) m.set(p.id, p);
    return m;
  }, [profiles.data]);

  const period = currentPeriod();
  const thisMonth = (usage.data ?? []).filter((r) => r.period_yyyymm === period);
  const monthTotal = thisMonth.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of usage.data ?? []) {
      const k = periodLabel(r.period_yyyymm);
      map.set(k, (map.get(k) ?? 0) + Number(r.cost_usd ?? 0));
    }
    return Array.from(map.entries())
      .map(([m, total]) => ({ m, total: Number(total.toFixed(4)) }))
      .sort((a, b) => a.m.localeCompare(b.m))
      .slice(-6);
  }, [usage.data]);

  const top = useMemo(() => {
    return [...thisMonth]
      .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd))
      .slice(0, 10);
  }, [thisMonth]);

  return (
    <>
      <PageHead
        meta={`Cari ay: ${periodLabel(period)} · Cəm: $${monthTotal.toFixed(2)}`}
        title="MIRAI istifadə"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Kpi label="Cəm xərc (cari ay)" value={`$${monthTotal.toFixed(2)}`} accent />
        <Kpi label="Aktiv istifadəçi" value={`${thisMonth.length}`} />
        <Kpi
          label="Sərhədə yaxın"
          value={`${
            thisMonth.filter((r) => Number(r.cost_usd) >= CAP_USD * WARN_PCT).length
          }`}
          tone={
            thisMonth.some((r) => Number(r.cost_usd) >= CAP_USD * WARN_PCT)
              ? 'warning'
              : undefined
          }
        />
      </div>

      <div className="card mb-5">
        <h3 className="text-h3 mb-3">Aylıq cəmi (son 6 ay)</h3>
        {monthly.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Hələ istifadə yoxdur.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid stroke="rgba(122,133,127,0.2)" vertical={false} />
              <XAxis dataKey="m" stroke="#7A857F" />
              <YAxis stroke="#7A857F" />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'USD']}
                cursor={{ fill: 'rgba(173,251,73,0.06)' }}
              />
              <Bar dataKey="total" fill="#ADFB49" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-h3 mb-3">Cari ay — ən böyük istifadəçilər</h3>
        {top.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Cari ay üçün istifadə yoxdur.
          </p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İstifadəçi', 'Tokens (in/out)', 'Xərc', 'Sərhəd %'].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-meta"
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
              {top.map((r) => {
                const cost = Number(r.cost_usd);
                const pct = (cost / CAP_USD) * 100;
                const tone = pct >= 100 ? '#EF4444' : pct >= 80 ? '#D97706' : '#22C55E';
                const p = profileMap.get(r.user_id);
                return (
                  <tr
                    key={r.user_id}
                    style={{ borderBottom: '1px solid var(--line-soft)' }}
                  >
                    <td className="py-2 px-3">
                      {p?.full_name || p?.email || r.user_id.slice(0, 8)}
                    </td>
                    <td
                      className="py-2 px-3 text-meta"
                      style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {r.tokens_in.toLocaleString()} / {r.tokens_out.toLocaleString()}
                    </td>
                    <td
                      className="py-2 px-3"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      ${cost.toFixed(2)}
                    </td>
                    <td
                      className="py-2 px-3"
                      style={{
                        color: tone,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Math.round(pct)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'warning';
}) {
  const color = accent
    ? 'var(--brand-text)'
    : tone === 'warning'
      ? '#D97706'
      : 'var(--text)';
  return (
    <div className="card flex flex-col">
      <span
        className="text-meta uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <span
        className="text-h1 mt-1"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}
