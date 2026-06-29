import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN, bakuDaysUntil, bakuToday } from '@/lib/format';
import { useSlashFocus } from '@/lib/useSlashFocus';
import { downloadCsv } from '@/lib/csv';

const STATUS_LABEL = { order: 'Sifariş', in_progress: 'İcrada', delivered: 'Təhvil', paid: 'Ödənildi' } as const;
type Status = keyof typeof STATUS_LABEL;

// Work status (the `status` enum) — kept as-is in the DB, relabelled for the
// "İş statusu" column. Payment status is derived separately from paid_amount.
const WORK_STATUS: Record<Status, { label: string; bg: string; color: string }> = {
  order: { label: 'Başlanmayıb', bg: 'var(--surface-mist)', color: 'var(--text-muted)' },
  in_progress: { label: 'İcrada', bg: 'var(--info-bg, #e3effb)', color: 'var(--info-deep, #1d5fb0)' },
  delivered: { label: 'Tamamlandı', bg: 'var(--success-bg, #e6f4ea)', color: 'var(--success-deep, #1d7a44)' },
  paid: { label: 'Tamamlandı', bg: 'var(--success-bg, #e6f4ea)', color: 'var(--success-deep, #1d7a44)' },
};

// Common subcontractor disciplines — offered as datalist hints, not enforced.
const DISCIPLINES = ['MEP', 'İnteryer', 'Smeta', 'Konstruksiya', 'Müəllif Nəzarəti', 'Müayinə', 'Memarlıq', 'Landşaft', 'Geologiya'];

type OutsourceRow = {
  id: string;
  work_title: string;
  project_id: string | null;
  contact_company: string | null;
  contact_person: string | null;
  discipline: string | null;
  amount: number | null;
  paid_amount: number | null;
  advance_pct: number | null;
  interim_count: number | null;
  deadline: string | null;
  status: Status;
  responsible_user_id: string | null;
  payment_method: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

/** Derived payment state from contract vs paid — admin-only column. */
function paymentState(amount: number | null, paid: number): { label: string; color: string } {
  if (!amount || paid <= 0) return { label: 'Başlanmayıb', color: 'var(--text-muted)' };
  if (paid >= amount) return { label: 'Ödənildi', color: 'var(--success-deep, #1d7a44)' };
  return { label: 'Qismən', color: 'var(--warning, #c47d00)' };
}

const yearOf = (d: string | null | undefined) => (d ? Number(d.slice(0, 4)) : null);
const monthOf = (d: string | null | undefined) => (d ? Number(d.slice(5, 7)) : null);
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<OutsourceRow | null>(null);

  // Filters — match the screenshot: year · month · project · subcontractor search.
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const [monthFilter, setMonthFilter] = useState<'all' | number>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async () => {
      const { data, error } = await supabase.from(view as 'outsource_items').select('*').order('deadline', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OutsourceRow[];
    },
  });
  const rows = useMemo(() => q.data ?? [], [q.data]);

  const projects = useQuery({
    queryKey: ['outsource-projects-map'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name');
      return new Map((data ?? []).map((p) => [p.id, p.name]));
    },
  });
  const projectName = (id: string | null | undefined) => (id && projects.data?.get(id)) || '—';

  const profilesMap = useQuery({
    queryKey: ['outsource-profiles-map'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      return new Map((data ?? []).map((p) => [p.id, p.full_name as string | null]));
    },
  });
  const responsibleName = (id: string | null | undefined) => (id && profilesMap.data?.get(id)) || null;

  // The date a row is bucketed under for the year/month filters: deadline first
  // (the work's timeframe), else creation date.
  const rowDate = (r: OutsourceRow) => r.deadline ?? (r.created_at ? r.created_at.slice(0, 10) : null);
  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of rows) { const y = yearOf(rowDate(r)); if (y) ys.add(y); }
    return [...ys].sort((a, b) => b - a);
  }, [rows]);

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('outsource_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outsource'] }); setConfirmDeleteId(null); },
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (projectFilter !== 'all' && r.project_id !== projectFilter) return false;
      if (yearFilter !== 'all' && yearOf(rowDate(r)) !== yearFilter) return false;
      if (monthFilter !== 'all' && monthOf(rowDate(r)) !== monthFilter) return false;
      if (term) {
        const hay = `${r.contact_company ?? ''} ${r.contact_person ?? ''} ${r.discipline ?? ''} ${r.work_title ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, projectFilter, yearFilter, monthFilter]);

  // Admin finance totals across the *filtered* set — drives the header meta.
  const totals = useMemo(() => {
    let contract = 0, paid = 0;
    for (const r of filtered) { contract += Number(r.amount ?? 0); paid += Number(r.paid_amount ?? 0); }
    return { contract, paid, remaining: Math.max(0, contract - paid) };
  }, [filtered]);

  const anyFilter = search || yearFilter !== 'all' || monthFilter !== 'all' || projectFilter !== 'all' || statusFilter !== 'all';
  const resetFilters = () => { setSearch(''); setYearFilter('all'); setMonthFilter('all'); setProjectFilter('all'); setStatusFilter('all'); };

  return (
    <>
      <PageHead
        meta={
          isAdmin
            ? `Müqavilə ${formatAZN(totals.contract)} · ${formatAZN(totals.paid)} ödənilib · ${formatAZN(totals.remaining)} qalıq`
            : 'İstifadəçi görünüşü (məbləğlər gizlidir)'
        }
        title="Podrat İşləri"
        actions={
          <>
            {isAdmin && rows.length > 0 ? (
              <button
                type="button"
                className="btn-outline"
                onClick={() =>
                  downloadCsv(
                    `podrat-${new Date().toISOString().slice(0, 10)}.csv`,
                    ['Podratçı', 'İxtisas', 'İş', 'Layihə', 'İş statusu', 'Deadline', 'Müqavilə', 'Ödənildi', 'Qalıq'],
                    filtered.map((r) => ({
                      'Podratçı': r.contact_company ?? '',
                      'İxtisas': r.discipline ?? '',
                      'İş': r.work_title ?? '',
                      'Layihə': projectName(r.project_id),
                      'İş statusu': WORK_STATUS[r.status]?.label ?? r.status,
                      'Deadline': r.deadline ?? '',
                      'Müqavilə': r.amount ?? '',
                      'Ödənildi': r.paid_amount ?? 0,
                      'Qalıq': Math.max(0, Number(r.amount ?? 0) - Number(r.paid_amount ?? 0)),
                    })),
                  )
                }
              >
                ↓ CSV
              </button>
            ) : null}
            {isAdmin ? <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Yeni</button> : null}
          </>
        }
      />

      {/* Spend-by-responsible breakdown (admin) — kept; now paid uses paid_amount */}
      {isAdmin && rows.length > 0 ? (
        <div className="card mb-4">
          <h3 className="text-h3 mb-2">Məsul şəxslər üzrə xərc</h3>
          {(() => {
            const buckets = new Map<string, { count: number; total: number; paid: number }>();
            for (const r of rows) {
              const key = r.responsible_user_id ?? 'unassigned';
              const cur = buckets.get(key) ?? { count: 0, total: 0, paid: 0 };
              cur.count += 1;
              cur.total += Number(r.amount ?? 0);
              cur.paid += Number(r.paid_amount ?? 0);
              buckets.set(key, cur);
            }
            const list = [...buckets.entries()].sort((a, b) => b[1].total - a[1].total);
            const max = Math.max(1, ...list.map(([, v]) => v.total));
            return (
              <ul className="space-y-1.5">
                {list.slice(0, 8).map(([id, v]) => (
                  <li key={id} className="flex items-center gap-3 text-meta">
                    <span className="w-32 shrink-0 truncate" style={{ color: 'var(--text-muted)' }}>
                      {id === 'unassigned' ? '— təyin edilməyib —' : (responsibleName(id) ?? id.slice(0, 8))}
                    </span>
                    <div className="flex-1 h-4 rounded-full" style={{ background: 'var(--line-soft)' }}>
                      <div style={{ width: `${(v.total / max) * 100}%`, height: '100%', background: 'var(--brand-action)', borderRadius: 999 }} />
                    </div>
                    <span className="w-36 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(v.paid)} / {formatAZN(v.total)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ) : null}

      {/* Filter bar — year · month · project · subcontractor search */}
      {rows.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <select className="input" style={{ maxWidth: 150, height: 36 }} aria-label="İl" value={String(yearFilter)} onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">Bütün illər</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 150, height: 36 }} aria-label="Ay" value={String(monthFilter)} onChange={(e) => setMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">Bütün aylar</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 220, height: 36 }} aria-label="Layihə" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">Bütün layihələr</option>
            {[...(projects.data ?? new Map()).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <input
            ref={searchRef}
            className="input"
            style={{ maxWidth: 240, height: 36 }}
            placeholder="Podratçı axtar… (/)"
            aria-label="Podratçı axtar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {anyFilter ? (
            <button type="button" className="btn-ghost" style={{ height: 36 }} onClick={resetFilters}>Sıfırla</button>
          ) : null}
        </div>
      ) : null}

      {/* Secondary work-status chips */}
      {rows.length > 0 ? (
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'order', 'in_progress', 'delivered', 'paid'] as const).map((s) => {
            const count = s === 'all' ? rows.length : rows.filter((r) => r.status === s).length;
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                className="chip"
                style={{ background: active ? 'var(--brand-action)' : 'var(--surface-mist)', color: active ? 'var(--ink)' : 'var(--text-muted)', fontSize: 12, fontWeight: active ? 600 : 400, opacity: count === 0 && s !== 'all' ? 0.4 : 1 }}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'Hamısı' : (WORK_STATUS[s as Status]?.label ?? s)} · {count}
              </button>
            );
          })}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Podrat işi yoxdur"
          body="Sifariş yarat və icraçıya təhvil ver."
          cta={isAdmin ? <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ İlk sifarişi yarat</button> : null}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body" style={{ minWidth: isAdmin ? 980 : 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {(isAdmin
                  ? ['Podratçı', 'Layihə', 'İş statusu', 'Deadline', 'Ödəniş', 'Mərhələlər', 'Müqavilə', 'Ödənildi', 'Qalıq', '']
                  : ['Podratçı', 'Layihə', 'İş statusu', 'Deadline']
                ).map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 4} className="py-6 text-center text-meta" style={{ color: 'var(--text-muted)' }}>
                    Filtrə uyğun nəticə yoxdur.{' '}
                    <button type="button" className="underline" style={{ color: 'var(--brand-text)' }} onClick={resetFilters}>Sıfırla</button>
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const amount = row.amount ?? null;
                const paid = Number(row.paid_amount ?? 0);
                const remaining = amount != null ? Math.max(0, amount - paid) : null;
                const advancePct = row.advance_pct ?? 30;
                const advanceCovered = amount != null && paid >= (amount * advancePct) / 100 && paid > 0;
                const finalCovered = amount != null && amount > 0 && paid >= amount;
                const ws = WORK_STATUS[row.status];
                const ps = paymentState(amount, paid);
                return (
                  <tr key={row.id} className="hover:bg-surface-mist transition-colors" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    {/* Podratçı — company + discipline sub-label */}
                    <td className="py-3 px-3">
                      <div className="font-medium" style={{ color: 'var(--text)' }}>{row.contact_company || row.work_title || '—'}</div>
                      {row.discipline ? (
                        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{row.discipline}</div>
                      ) : null}
                    </td>
                    {/* Layihə */}
                    <td className="py-3 px-3 truncate max-w-[200px]">
                      {row.project_id ? (
                        <a href={`/layihelər/${row.project_id}`} className="hover:underline" style={{ color: 'var(--brand-text)' }}>{projectName(row.project_id)}</a>
                      ) : '—'}
                    </td>
                    {/* İş statusu */}
                    <td className="py-3 px-3">
                      <span className="chip" style={{ background: ws.bg, color: ws.color, fontSize: 12 }}>{ws.label}</span>
                    </td>
                    {/* Deadline + countdown */}
                    <td className="py-3 px-3" style={{ whiteSpace: 'nowrap' }}>
                      {row.deadline ? (
                        <div>
                          <div style={deadlineStyle(row)}>{row.deadline}</div>
                          {deadlineHint(row) ? (
                            <div className="text-meta" style={{ color: deadlineStyle(row)?.color ?? 'var(--text-muted)' }}>{deadlineHint(row)}</div>
                          ) : null}
                        </div>
                      ) : '—'}
                    </td>
                    {isAdmin ? (
                      <>
                        {/* Ödəniş statusu */}
                        <td className="py-3 px-3"><span className="text-meta" style={{ color: ps.color, fontWeight: 500 }}>{ps.label}</span></td>
                        {/* Mərhələlər */}
                        <td className="py-3 px-3">
                          <div className="flex gap-1 flex-wrap">
                            <MilestoneChip label={`Avans ${advancePct}%`} on={advanceCovered} />
                            <MilestoneChip label={`Ara×${row.interim_count ?? 0}`} on={(row.interim_count ?? 0) > 0} />
                            <MilestoneChip label="Final" on={finalCovered} />
                          </div>
                        </td>
                        {/* Müqavilə */}
                        <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{amount != null ? formatAZN(amount) : '—'}</td>
                        {/* Ödənildi */}
                        <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums', color: paid > 0 ? 'var(--success-deep, #1d7a44)' : 'var(--text-muted)' }}>{formatAZN(paid)}</td>
                        {/* Qalıq */}
                        <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums', color: (remaining ?? 0) > 0 ? 'var(--error-deep, #b3261e)' : 'var(--text-muted)', fontWeight: (remaining ?? 0) > 0 ? 600 : 400 }}>
                          {remaining != null ? formatAZN(remaining) : '—'}
                        </td>
                        {/* Actions */}
                        <td className="py-3 px-3 text-right" style={{ whiteSpace: 'nowrap' }}>
                          {confirmDeleteId === row.id ? (
                            <span className="inline-flex gap-1">
                              <button type="button" className="chip" style={{ background: 'var(--error-deep)', color: 'white', fontSize: 11 }} disabled={deleteItem.isPending} onClick={() => deleteItem.mutate(row.id)}>{deleteItem.isPending ? '…' : 'Bəli'}</button>
                              <button type="button" className="chip" style={{ fontSize: 11 }} onClick={() => setConfirmDeleteId(null)}>×</button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <button type="button" className="chip opacity-50 hover:opacity-100" style={{ color: 'var(--brand-text)', fontSize: 13 }} onClick={() => setEditItem(row)} title="Düzəlt" aria-label={`Düzəlt: ${row.contact_company ?? row.work_title}`}>✎</button>
                              <button type="button" className="chip opacity-50 hover:opacity-100" style={{ color: 'var(--error-deep)', fontSize: 13 }} onClick={() => setConfirmDeleteId(row.id)} title="Sil" aria-label={`Sil: ${row.contact_company ?? row.work_title}`}>🗑</button>
                            </span>
                          )}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            {isAdmin && filtered.length > 0 ? (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td colSpan={6} className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>Cəmi (görünən · {filtered.length})</td>
                  <td className="py-3 px-3 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(totals.contract)}</td>
                  <td className="py-3 px-3 font-medium" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--success-deep, #1d7a44)' }}>{formatAZN(totals.paid)}</td>
                  <td className="py-3 px-3 font-medium" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--error-deep, #b3261e)' }}>{formatAZN(totals.remaining)}</td>
                  <td className="py-3 px-3" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
      {(createOpen || editItem) && isAdmin ? (
        <OutsourceModal item={editItem} onClose={() => { setCreateOpen(false); setEditItem(null); }} />
      ) : null}
    </>
  );
}

function MilestoneChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="chip"
      style={{
        fontSize: 11,
        padding: '2px 7px',
        background: on ? 'var(--success-bg, #e6f4ea)' : 'var(--surface-mist)',
        color: on ? 'var(--success-deep, #1d7a44)' : 'var(--text-muted)',
        border: on ? '1px solid var(--success-deep, #1d7a44)' : '1px solid var(--line)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function deadlineStyle(row: OutsourceRow): CSSProperties | undefined {
  if (!row.deadline || row.status === 'paid' || row.status === 'delivered') return undefined;
  if (row.deadline < bakuToday()) return { color: 'var(--error-deep, #b3261e)', fontWeight: 600 };
  const days = bakuDaysUntil(row.deadline);
  if (days >= 0 && days <= 3) return { color: 'var(--warning, #c47d00)' };
  return undefined;
}
function deadlineHint(row: OutsourceRow): string | null {
  if (!row.deadline || row.status === 'paid' || row.status === 'delivered') return null;
  const days = bakuDaysUntil(row.deadline);
  if (days < 0) return `${Math.abs(days)}g gecikib`;
  if (days === 0) return 'Bu gün';
  if (days <= 14) return `${days}g qalıb`;
  return null;
}

function OutsourceModal({ item, onClose }: { item: OutsourceRow | null; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!item;
  const [workTitle, setWorkTitle] = useState(item?.work_title ?? '');
  const [contactCompany, setContactCompany] = useState(item?.contact_company ?? '');
  const [contactPerson, setContactPerson] = useState(item?.contact_person ?? '');
  const [discipline, setDiscipline] = useState(item?.discipline ?? '');
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : '');
  const [paidAmount, setPaidAmount] = useState(item?.paid_amount != null ? String(item.paid_amount) : '');
  const [advancePct, setAdvancePct] = useState(item?.advance_pct != null ? String(item.advance_pct) : '30');
  const [interimCount, setInterimCount] = useState(item?.interim_count != null ? String(item.interim_count) : '0');
  const [deadline, setDeadline] = useState(item?.deadline ?? '');
  const [status, setStatus] = useState<Status>(item?.status ?? 'order');
  const [projectId, setProjectId] = useState<string>(item?.project_id ?? '');
  const [responsibleUserId, setResponsibleUserId] = useState<string>(item?.responsible_user_id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<string>(item?.payment_method ?? '');

  const projects = useQuery({
    queryKey: ['projects', 'active-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name').is('archived_at', null).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const profiles = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!workTitle.trim()) throw new Error('İş adı tələb olunur');
      const amt = amount.trim() ? Number(amount) : null;
      if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) throw new Error('Müqavilə məbləği 0-dan böyük olmalıdır');
      const paid = paidAmount.trim() ? Number(paidAmount) : 0;
      if (!Number.isFinite(paid) || paid < 0) throw new Error('Ödənilən məbləğ mənfi ola bilməz');
      if (amt !== null && paid > amt) throw new Error('Ödənilən məbləğ müqavilədən böyük ola bilməz');
      const pct = advancePct.trim() ? Number(advancePct) : 30;
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Avans faizi 0–100 aralığında olmalıdır');
      const interim = interimCount.trim() ? Math.max(0, Math.trunc(Number(interimCount))) : 0;
      const payload = {
        work_title: workTitle.trim(),
        contact_company: contactCompany.trim() || null,
        contact_person: contactPerson.trim() || null,
        discipline: discipline.trim() || null,
        amount: amt,
        paid_amount: paid,
        advance_pct: pct,
        interim_count: interim,
        deadline: deadline || null,
        status,
        project_id: projectId || null,
        responsible_user_id: responsibleUserId || null,
        payment_method: isAdmin ? paymentMethod || null : null,
      };
      const { error } = isEdit
        ? await supabase.from('outsource_items').update(payload).eq('id', item!.id)
        : await supabase.from('outsource_items').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outsource'] });
      qc.invalidateQueries({ queryKey: ['fin', 'outsource_summary'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label={isEdit ? 'Podrat işini düzəlt' : 'Yeni podrat işi'}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h3 mb-4">{isEdit ? 'Podrat işini düzəlt' : 'Yeni podrat işi'}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Podratçı (şirkət/şəxs)</span>
              <input className="input w-full" value={contactCompany} onChange={(e) => setContactCompany(e.target.value)} placeholder="məs. Farid Expert" />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İxtisas</span>
              <input className="input w-full" list="outsource-disciplines" value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="MEP, Smeta…" />
              <datalist id="outsource-disciplines">{DISCIPLINES.map((d) => <option key={d} value={d} />)}</datalist>
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İş adı *</span>
            <input className="input w-full" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Layihə</span>
            <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— seç —</option>
              {(projects.data ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Müqavilə məbləği (AZN)</span>
              <input type="number" min="0.01" step="0.01" className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ödənilib (AZN)</span>
              <input type="number" min="0" step="0.01" className="input w-full" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Avans %</span>
              <input type="number" min="0" max="100" step="1" className="input w-full" value={advancePct} onChange={(e) => setAdvancePct(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ara ödəniş sayı</span>
              <input type="number" min="0" step="1" className="input w-full" value={interimCount} onChange={(e) => setInterimCount(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Deadline</span>
              <input type="date" className="input w-full" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İş statusu</span>
              <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Əlaqə şəxsi</span>
              <input className="input w-full" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Məsul şəxs</span>
            <select className="input w-full" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
              <option value="">— seç —</option>
              {(profiles.data ?? []).map((p: { id: string; full_name: string | null }) => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
            </select>
          </label>
          {isAdmin ? (
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ödəniş üsulu</span>
              <select className="input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">— seç —</option>
                <option value="cash">Nağd</option>
                <option value="bank_transfer">Bank köçürmə</option>
                <option value="card">Kart</option>
              </select>
            </label>
          ) : null}
          {save.error ? <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</p> : null}
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button className="btn-ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? (isEdit ? 'Saxlanılır…' : 'Yaradılır…') : (isEdit ? 'Yadda saxla' : 'Yarat')}
          </button>
        </div>
      </div>
    </div>
  );
}
