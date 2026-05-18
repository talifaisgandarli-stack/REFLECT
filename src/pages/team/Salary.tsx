/**
 * Əmək Haqqı — PRD §8.2 / Module 8.2
 * Admin: sees all employees + can add rows.
 * User: sees own salary history only (RLS enforced at DB).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { downloadCsv } from '@/lib/csv';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import type { Profile, Salary } from '@/types/db';

type SalaryRow = Salary & { profile?: Pick<Profile, 'id' | 'full_name' | 'email'> };

const CURRENCIES = ['AZN', 'USD', 'EUR'] as const;
type Currency = (typeof CURRENCIES)[number];

// PRD §3.2 — `salaries.components jsonb` for base/bonus breakdown
type SalaryComponents = {
  base?: number;
  bonus?: number;
  allowance?: number;
  other?: number;
};

const COMPONENT_LABELS: Record<keyof SalaryComponents, string> = {
  base: 'Əsas',
  bonus: 'Bonus',
  allowance: 'Əlavə',
  other: 'Digər',
};

function formatComponents(c: SalaryComponents | null | undefined): string {
  if (!c) return '—';
  const parts: string[] = [];
  for (const k of Object.keys(COMPONENT_LABELS) as (keyof SalaryComponents)[]) {
    const v = c[k];
    if (typeof v === 'number' && v > 0) {
      parts.push(`${COMPONENT_LABELS[k]} ${v.toLocaleString('az-AZ')}`);
    }
  }
  return parts.length ? parts.join(' · ') : '—';
}

export function SalaryPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('salaries').delete().eq('id', id);
      if (error) throw error;
      try {
        await supabase.from('audit_log').insert({
          actor_id: profile?.id ?? null,
          action: 'salary_deleted',
          resource: `salary:${id}`,
          ip: null,
          user_agent: navigator.userAgent,
        });
      } catch { /* fire-and-forget */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salaries'] });
      setConfirmDeleteId(null);
    },
  });

  // PRD §8.2 — admin shortcut: copy a salary row into a new period (next month)
  const copyForward = useMutation({
    mutationFn: async (src: SalaryRow) => {
      // Next month from src.effective_from
      const d = new Date(src.effective_from);
      d.setMonth(d.getMonth() + 1);
      const nextFrom = d.toISOString().slice(0, 10);
      const { error } = await supabase.from('salaries').insert({
        employee_id: src.employee_id,
        amount: src.amount,
        currency: src.currency,
        effective_from: nextFrom,
        effective_to: null,
        components: src.components,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salaries'] }),
  });

  const rows = useQuery({
    queryKey: ['salaries', isAdmin],
    queryFn: async (): Promise<SalaryRow[]> => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from('salaries')
          .select('*, profile:profiles(id, full_name, email)')
          .order('effective_from', { ascending: false });
        if (error) throw error;
        return (data ?? []) as SalaryRow[];
      }
      const { data, error } = await supabase
        .from('salaries')
        .select('*')
        .eq('employee_id', profile!.id)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
    enabled: !!profile?.id,
  });

  const profiles = useQuery({
    queryKey: ['profiles-list'],
    enabled: isAdmin,
    queryFn: async (): Promise<Pick<Profile, 'id' | 'full_name' | 'email'>[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin'}
        title="Əmək Haqqı"
        actions={
          <>
            {/* PRD §8.2 — CSV export (audit / handover). RLS scopes rows so
                admin gets firm-wide, user gets own only — no extra check needed. */}
            <button
              type="button"
              className="btn-outline"
              disabled={(rows.data ?? []).length === 0}
              onClick={() => {
                downloadCsv(
                  `maas-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['İşçi', 'Email', 'Başlanğıc', 'Bitiş', 'Məbləğ', 'Valyuta', 'Komponentlər'],
                  (rows.data ?? []).map((r) => ({
                    'İşçi': r.profile?.full_name ?? '',
                    'Email': r.profile?.email ?? '',
                    'Başlanğıc': r.effective_from,
                    'Bitiş': r.effective_to ?? '',
                    'Məbləğ': r.amount,
                    'Valyuta': r.currency,
                    'Komponentlər': formatComponents(r.components as SalaryComponents | null),
                  })),
                );
              }}
            >
              ↓ CSV
            </button>
            {isAdmin ? (
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + Maaş cədvəli
              </button>
            ) : null}
          </>
        }
      />

      {/* PRD §8.2 — admin trend chart per employee */}
      {isAdmin && (rows.data ?? []).length > 1 ? (
        <SalaryTrendChart rows={rows.data ?? []} />
      ) : null}

      {/* PRD §8.2 — admin sum-by-currency this year (cumulative spend) + median */}
      {isAdmin && (rows.data ?? []).length > 0 ? (() => {
        const year = new Date().getFullYear();
        const totals = new Map<string, number>();
        // Per-currency salary amounts for median calc
        const byCurrency = new Map<string, number[]>();
        for (const r of rows.data ?? []) {
          const startYear = new Date(r.effective_from).getFullYear();
          if (startYear !== year) continue;
          totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.amount));
          const arr = byCurrency.get(r.currency) ?? [];
          arr.push(Number(r.amount));
          byCurrency.set(r.currency, arr);
        }
        if (totals.size === 0) return null;
        // Median per currency — useful for compensation reviews
        const median = (arr: number[]): number => {
          const sorted = [...arr].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };
        return (
          <div className="card mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {year} cəmi:
            </span>
            {Array.from(totals.entries()).map(([cur, sum]) => (
              <span
                key={cur}
                className="chip"
                style={{
                  background: 'var(--brand-glow-sm)',
                  color: 'var(--brand-text)',
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                }}
                title={`Median: ${median(byCurrency.get(cur) ?? []).toLocaleString('az-AZ')} ${cur} (n=${(byCurrency.get(cur) ?? []).length})`}
              >
                {sum.toLocaleString('az-AZ')} {cur}
                <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 10 }}>
                  · med {median(byCurrency.get(cur) ?? []).toLocaleString('az-AZ')}
                </span>
              </span>
            ))}
          </div>
        );
      })() : null}

      {rows.isLoading ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Yüklənir…
        </div>
      ) : (rows.data ?? []).length === 0 ? (
        <EmptyState
          title="Maaş məlumatı yoxdur"
          body={isAdmin ? 'Heyətin maaş cədvəlini əlavə edin.' : 'Maaş tarixiniz hazırda əlçatımlı deyil.'}
          cta={isAdmin ? <button className="btn-primary" onClick={() => setShowForm(true)}>+ Maaş cədvəli</button> : undefined}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {isAdmin && (
                  <th className="text-meta text-left py-3 pr-4" style={{ color: 'var(--text-muted)' }}>
                    İşçi
                  </th>
                )}
                <th className="text-meta text-right py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Məbləğ
                </th>
                <th className="text-meta text-left py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Valyuta
                </th>
                <th className="text-meta text-left py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Başlanğıc
                </th>
                <th className="text-meta text-left py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Bitmə
                </th>
                <th className="text-meta text-left py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                  Komponentlər
                </th>
                {isAdmin && (
                  <th className="text-meta text-right py-3 pl-4" style={{ color: 'var(--text-muted)' }}>
                    {' '}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {isAdmin && (
                    <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text)' }}>
                      {r.profile?.full_name ?? r.profile?.email ?? r.employee_id.slice(0, 8)}
                    </td>
                  )}
                  <td
                    className="py-3 px-4 text-right font-medium"
                    style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}
                  >
                    {r.amount.toLocaleString('az-AZ')}
                  </td>
                  <td className="py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                    {r.currency}
                  </td>
                  <td className="py-3 px-4" style={{ color: 'var(--text)' }}>
                    {r.effective_from}
                  </td>
                  <td className="py-3 px-4" style={{ color: 'var(--text-muted)' }}>
                    {r.effective_to ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-meta" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {formatComponents(r.components as SalaryComponents | null)}
                  </td>
                  {isAdmin && (
                    <td className="py-3 pl-4 text-right">
                      {confirmDeleteId === r.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            className="chip"
                            style={{ background: 'var(--error-deep)', color: 'white' }}
                            disabled={removeRow.isPending}
                            onClick={() => removeRow.mutate(r.id)}
                          >
                            {removeRow.isPending ? '…' : 'Bəli'}
                          </button>
                          <button
                            type="button"
                            className="chip"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Ləğv
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            className="chip"
                            style={{ color: 'var(--text-muted)' }}
                            onClick={() => copyForward.mutate(r)}
                            title="Növbəti aya köçür"
                            disabled={copyForward.isPending}
                          >
                            ⎘ Növbəti ay
                          </button>
                          <button
                            type="button"
                            className="chip"
                            style={{ color: 'var(--brand-text)' }}
                            onClick={() => setEditing(r)}
                          >
                            Redaktə
                          </button>
                          <button
                            type="button"
                            className="chip"
                            style={{ color: 'var(--error-deep)' }}
                            onClick={() => setConfirmDeleteId(r.id)}
                          >
                            Sil
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && isAdmin && (
        <SalaryFormModal
          profiles={profiles.data ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['salaries'] });
            setShowForm(false);
          }}
        />
      )}

      {editing && isAdmin && (
        <SalaryFormModal
          profiles={profiles.data ?? []}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['salaries'] });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

type FormProps = {
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'>[];
  existing?: SalaryRow;
  onClose: () => void;
  onSaved: () => void;
};

// PRD §8.2 — single modal supports both insert (no `existing`) and update.
function SalaryFormModal({ profiles, existing, onClose, onSaved }: FormProps) {
  const isEdit = !!existing;
  const initialComp = (existing?.components ?? {}) as SalaryComponents;
  const [employeeId, setEmployeeId] = useState(existing?.employee_id ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [currency, setCurrency] = useState<Currency>((existing?.currency as Currency) ?? 'AZN');
  const [effectiveFrom, setEffectiveFrom] = useState(existing?.effective_from ?? '');
  const [effectiveTo, setEffectiveTo] = useState(existing?.effective_to ?? '');
  const [base, setBase] = useState(initialComp.base != null ? String(initialComp.base) : '');
  const [bonus, setBonus] = useState(initialComp.bonus != null ? String(initialComp.bonus) : '');
  const [allowance, setAllowance] = useState(initialComp.allowance != null ? String(initialComp.allowance) : '');
  const [other, setOther] = useState(initialComp.other != null ? String(initialComp.other) : '');

  const save = useMutation({
    mutationFn: async () => {
      if (!employeeId || !amount || !effectiveFrom) throw new Error('Zəruri sahələri doldurun');
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) throw new Error('Məbləğ müsbət rəqəm olmalıdır');
      // PRD §REQ — date sanity: effective_to must be after effective_from
      if (effectiveTo && effectiveTo < effectiveFrom) {
        throw new Error('Bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz');
      }

      // Build components jsonb — only include keys with positive numeric values
      const components: SalaryComponents = {};
      const num = (s: string) => (s.trim() ? parseFloat(s) : NaN);
      const baseN = num(base);
      const bonusN = num(bonus);
      const allowN = num(allowance);
      const otherN = num(other);
      if (!isNaN(baseN) && baseN > 0) components.base = baseN;
      if (!isNaN(bonusN) && bonusN > 0) components.bonus = bonusN;
      if (!isNaN(allowN) && allowN > 0) components.allowance = allowN;
      if (!isNaN(otherN) && otherN > 0) components.other = otherN;
      const componentsForDb = Object.keys(components).length ? components : null;

      const payload = {
        employee_id: employeeId,
        amount: amt,
        currency,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        components: componentsForDb,
      };

      if (isEdit && existing) {
        const { error } = await supabase
          .from('salaries')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
        try {
          await supabase.from('audit_log').insert({
            action: 'salary_updated',
            resource: `salary:${existing.id}`,
          });
        } catch { /* fire-and-forget */ }
      } else {
        const { data: row, error } = await supabase
          .from('salaries')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        try {
          await supabase.from('audit_log').insert({
            action: 'salary_created',
            resource: `salary:${row.id}`,
          });
        } catch { /* fire-and-forget */ }
        // Notify the employee on insert only — edits often correct typos
        try {
          await supabase.from('notifications').insert({
            user_id: employeeId,
            kind: 'salary_changed',
            payload: { amount: amt, currency, effective_from: effectiveFrom },
            dispatched_channels: {},
          });
        } catch { /* fire-and-forget notification */ }
      }
    },
    onSuccess: onSaved,
  });

  return (
    <div
      role="dialog"
      aria-label="Maaş əlavə et"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-h2 mb-4">{isEdit ? 'Maaş cədvəlini redaktə et' : 'Maaş cədvəli'}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              İşçi <span style={{ color: 'var(--error-deep)' }}>*</span>
            </span>
            <select
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              disabled={isEdit}
            >
              <option value="">Seçin…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Məbləğ <span style={{ color: 'var(--error-deep)' }}>*</span>
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Valyuta
              </span>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Başlanğıc tarixi <span style={{ color: 'var(--error-deep)' }}>*</span>
              </span>
              <input
                type="date"
                className="input"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Bitmə tarixi
              </span>
              <input
                type="date"
                className="input"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                min={effectiveFrom || undefined}
              />
            </label>
          </div>

          {/* PRD §3.2 — components jsonb breakdown (optional). Sum may differ
              from `amount` if you want to record gross vs. allowances; neither
              field is enforced as a constraint. */}
          <div>
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Komponentlər (könüllü)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Əsas
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </label>
              <label className="block">
                <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Bonus
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={bonus}
                  onChange={(e) => setBonus(e.target.value)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </label>
              <label className="block">
                <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Əlavə
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={allowance}
                  onChange={(e) => setAllowance(e.target.value)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </label>
              <label className="block">
                <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Digər
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </label>
            </div>
          </div>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Yadda saxlanılır…' : isEdit ? 'Yenilə' : 'Saxla'}
          </button>
        </div>
      </form>
    </div>
  );
}

// PRD §8.2 — admin per-employee salary trend (chronological line chart)
function SalaryTrendChart({ rows }: { rows: SalaryRow[] }) {
  // Per-employee dropdown: pick which employee's history to plot
  const employees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.employee_id)) {
        seen.set(r.employee_id, r.profile?.full_name ?? r.profile?.email ?? r.employee_id.slice(0, 8));
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [rows]);

  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');

  // Filter + sort ascending so the line reads left-to-right
  const series = useMemo(() => {
    return rows
      .filter((r) => r.employee_id === employeeId)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
      .map((r) => ({
        date: r.effective_from,
        amount: Number(r.amount),
        currency: r.currency,
      }));
  }, [rows, employeeId]);

  if (employees.length === 0) return null;

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-h3">Maaş trendi</h3>
        <select
          className="input max-w-[220px]"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </div>
      {series.length < 2 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Trend üçün ən azı 2 maaş cədvəli lazımdır.
        </p>
      ) : (
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--ink)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  color: 'var(--canvas)',
                }}
                formatter={(value, _name, item) => {
                  const cur = (item?.payload as { currency?: string } | undefined)?.currency ?? '';
                  return [`${Number(value).toLocaleString('az-AZ')} ${cur}`, 'Məbləğ'];
                }}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="var(--brand-action)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--brand-action)', strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
