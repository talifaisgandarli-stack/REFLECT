import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react';
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

// Work status (the `status` enum) — relabelled for the "İş statusu" column.
// Payment progress is a separate concern, derived from the payments below.
const WORK_STATUS: Record<Status, { label: string; bg: string; color: string }> = {
  order: { label: 'Başlanmayıb', bg: 'var(--surface-mist)', color: 'var(--text-muted)' },
  in_progress: { label: 'İcrada', bg: 'var(--info-bg, #e3effb)', color: 'var(--info-deep, #1d5fb0)' },
  delivered: { label: 'Tamamlandı', bg: 'var(--success-bg, #e6f4ea)', color: 'var(--success-deep, #1d7a44)' },
  paid: { label: 'Tamamlandı', bg: 'var(--success-bg, #e6f4ea)', color: 'var(--success-deep, #1d7a44)' },
};

type PaymentKind = 'advance' | 'interim' | 'final';
const KIND_LABEL: Record<PaymentKind, string> = { advance: 'Avans', interim: 'Ara', final: 'Final' };
const METHOD_LABEL: Record<string, string> = { cash: 'Nağd', bank_transfer: 'Bank köçürmə', card: 'Kart' };
const METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'Nağd' },
  { value: 'bank_transfer', label: 'Bank köçürmə' },
  { value: 'card', label: 'Kart' },
];

const DISCIPLINES = ['MEP', 'İnteryer', 'Smeta', 'Konstruksiya', 'Müəllif Nəzarəti', 'Müayinə', 'Memarlıq', 'Landşaft', 'Geologiya'];

type OutsourceRow = {
  id: string;
  work_title: string;
  project_id: string | null;
  contact_company: string | null;
  contact_person: string | null;
  discipline: string | null;
  amount: number | null;
  deadline: string | null;
  status: Status;
  responsible_user_id: string | null;
  created_at?: string | null;
};

type OutsourcePayment = {
  id: string;
  outsource_item_id: string;
  kind: PaymentKind;
  label: string | null;
  amount: number;
  method: string | null;
  is_paid: boolean;
  paid_at: string | null;
  sort_order: number;
};

const sumPaid = (ps: OutsourcePayment[]) => ps.filter((p) => p.is_paid).reduce((s, p) => s + Number(p.amount), 0);

const yearOf = (d: string | null | undefined) => (d ? Number(d.slice(0, 4)) : null);
const monthOf = (d: string | null | undefined) => (d ? Number(d.slice(5, 7)) : null);
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<OutsourceRow | null>(null);

  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const [monthFilter, setMonthFilter] = useState<'all' | number>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  // All payments in one query (admin only) — grouped client-side, so no N+1.
  const paymentsQ = useQuery({
    queryKey: ['outsource-payments'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('outsource_payments').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as OutsourcePayment[];
    },
  });
  const paymentsByItem = useMemo(() => {
    const m = new Map<string, OutsourcePayment[]>();
    for (const p of paymentsQ.data ?? []) {
      const arr = m.get(p.outsource_item_id) ?? [];
      arr.push(p);
      m.set(p.outsource_item_id, arr);
    }
    return m;
  }, [paymentsQ.data]);
  const paymentsOf = (id: string) => paymentsByItem.get(id) ?? [];
  const paidOf = (id: string) => sumPaid(paymentsOf(id));

  const projects = useQuery({
    queryKey: ['outsource-projects-map'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name');
      return new Map((data ?? []).map((p) => [p.id, p.name]));
    },
  });
  const projectName = (id: string | null | undefined) => (id && projects.data?.get(id)) || '—';

  const rowDate = (r: OutsourceRow) => r.deadline ?? (r.created_at ? r.created_at.slice(0, 10) : null);
  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of rows) { const y = yearOf(rowDate(r)); if (y) ys.add(y); }
    return [...ys].sort((a, b) => b - a);
  }, [rows]);

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      // payments cascade-delete via FK.
      const { error } = await supabase.from('outsource_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outsource'] });
      qc.invalidateQueries({ queryKey: ['outsource-payments'] });
      setConfirmDeleteId(null);
    },
  });

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

  const totals = useMemo(() => {
    let contract = 0, paid = 0;
    for (const r of filtered) { contract += Number(r.amount ?? 0); paid += paidOf(r.id); }
    return { contract, paid, remaining: Math.max(0, contract - paid) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, paymentsByItem]);

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
                    ['Podratçı', 'İxtisas', 'İş', 'Layihə', 'İş statusu', 'Deadline', 'Müqavilə', 'Ödənilib', 'Qalıq'],
                    filtered.map((r) => {
                      const paid = paidOf(r.id);
                      return {
                        'Podratçı': r.contact_company ?? '',
                        'İxtisas': r.discipline ?? '',
                        'İş': r.work_title ?? '',
                        'Layihə': projectName(r.project_id),
                        'İş statusu': WORK_STATUS[r.status]?.label ?? r.status,
                        'Deadline': r.deadline ?? '',
                        'Müqavilə': r.amount ?? '',
                        'Ödənilib': paid,
                        'Qalıq': Math.max(0, Number(r.amount ?? 0) - paid),
                      };
                    }),
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

      {isAdmin && rows.length > 0 ? (
        <div className="card mb-4">
          <h3 className="text-h3 mb-2">Podratçılar üzrə xərc</h3>
          {(() => {
            const buckets = new Map<string, { count: number; total: number; paid: number }>();
            for (const r of rows) {
              const key = (r.contact_company ?? '').trim() || '—';
              const cur = buckets.get(key) ?? { count: 0, total: 0, paid: 0 };
              cur.count += 1;
              cur.total += Number(r.amount ?? 0);
              cur.paid += paidOf(r.id);
              buckets.set(key, cur);
            }
            const list = [...buckets.entries()].sort((a, b) => b[1].total - a[1].total);
            const max = Math.max(1, ...list.map(([, v]) => v.total));
            return (
              <ul className="space-y-1.5">
                {list.slice(0, 8).map(([name, v]) => (
                  <li key={name} className="flex items-center gap-3 text-meta">
                    <span className="w-36 shrink-0 truncate" style={{ color: 'var(--text-muted)' }} title={name === '—' ? undefined : name}>
                      {name === '—' ? '— podratçı qeyd edilməyib —' : name}
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
          <input ref={searchRef} className="input" style={{ maxWidth: 240, height: 36 }} placeholder="Podratçı axtar… (/)" aria-label="Podratçı axtar" value={search} onChange={(e) => setSearch(e.target.value)} />
          {anyFilter ? <button type="button" className="btn-ghost" style={{ height: 36 }} onClick={resetFilters}>Sıfırla</button> : null}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'order', 'in_progress', 'delivered', 'paid'] as const).map((s) => {
            const count = s === 'all' ? rows.length : rows.filter((r) => r.status === s).length;
            const active = statusFilter === s;
            return (
              <button key={s} type="button" className="chip" style={{ background: active ? 'var(--brand-action)' : 'var(--surface-mist)', color: active ? 'var(--ink)' : 'var(--text-muted)', fontSize: 12, fontWeight: active ? 600 : 400, opacity: count === 0 && s !== 'all' ? 0.4 : 1 }} onClick={() => setStatusFilter(s)}>
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
          <table className="w-full text-body" style={{ minWidth: isAdmin ? 1040 : 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {(isAdmin
                  ? ['Podratçı / İş', 'Layihə', 'İş statusu', 'Deadline', 'Ödəniş', 'Mərhələlər', 'Müqavilə', 'Ödənilib', 'Qalıq', '']
                  : ['Podratçı / İş', 'Layihə', 'İş statusu', 'Deadline']
                ).map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
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
              {(() => {
                // Group every work under its subcontractor (contact_company) so a
                // podratçı's jobs sit together with a per-podratçı subtotal row.
                const groups = new Map<string, OutsourceRow[]>();
                for (const r of filtered) {
                  const key = (r.contact_company ?? '').trim() || '—';
                  const arr = groups.get(key) ?? [];
                  arr.push(r);
                  groups.set(key, arr);
                }
                const gTotal = (items: OutsourceRow[]) => items.reduce((s, r) => s + Number(r.amount ?? 0), 0);
                return [...groups.entries()].sort((a, b) => gTotal(b[1]) - gTotal(a[1])).map(([company, items]) => {
                  const gContract = gTotal(items);
                  const gPaid = items.reduce((s, r) => s + paidOf(r.id), 0);
                  const gRemaining = Math.max(0, gContract - gPaid);
                  const disciplines = [...new Set(items.map((i) => i.discipline).filter(Boolean))];
                  return (
                    <Fragment key={company}>
                      <tr style={{ background: 'var(--surface-mist)', borderTop: '1px solid var(--line)' }}>
                        <td colSpan={isAdmin ? 6 : 4} className="py-2 px-3">
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{company === '—' ? '— podratçı qeyd edilməyib —' : company}</span>
                          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{' · '}{items.length} iş{disciplines.length ? ' · ' + disciplines.join(', ') : ''}</span>
                        </td>
                        {isAdmin ? (
                          <>
                            <td className="py-2 px-3 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAZN(gContract)}</td>
                            <td className="py-2 px-3 font-semibold" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--success-deep, #1d7a44)' }}>{formatAZN(gPaid)}</td>
                            <td className="py-2 px-3 font-semibold" style={{ fontVariantNumeric: 'tabular-nums', color: gRemaining > 0 ? 'var(--error-deep, #b3261e)' : 'var(--text-muted)' }}>{formatAZN(gRemaining)}</td>
                            <td className="py-2 px-3" />
                          </>
                        ) : null}
                      </tr>
                      {items.map((row) => {
                const amount = row.amount ?? null;
                const ps = paymentsOf(row.id);
                const paid = sumPaid(ps);
                const remaining = amount != null ? Math.max(0, amount - paid) : null;
                const ws = WORK_STATUS[row.status];
                const payState = !amount || paid <= 0 ? { label: 'Başlanmayıb', color: 'var(--text-muted)' }
                  : paid >= amount ? { label: 'Ödənildi', color: 'var(--success-deep, #1d7a44)' }
                  : { label: 'Qismən', color: 'var(--warning, #c47d00)' };
                const advance = ps.filter((p) => p.kind === 'advance');
                const interim = ps.filter((p) => p.kind === 'interim');
                const fin = ps.filter((p) => p.kind === 'final');
                const allPaid = (arr: OutsourcePayment[]) => arr.length > 0 && arr.every((p) => p.is_paid);
                const paidMethods = [...new Set(ps.filter((p) => p.is_paid && p.method).map((p) => p.method as string))];
                return (
                  <tr key={row.id} className="hover:bg-surface-mist transition-colors" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-3 px-3" style={{ paddingLeft: 24 }}>
                      <div style={{ color: 'var(--text)' }}>{row.work_title}</div>
                      {row.discipline ? <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{row.discipline}</div> : null}
                    </td>
                    <td className="py-3 px-3 truncate max-w-[200px]">
                      {row.project_id ? <a href={`/layihelər/${row.project_id}`} className="hover:underline" style={{ color: 'var(--brand-text)' }}>{projectName(row.project_id)}</a> : '—'}
                    </td>
                    <td className="py-3 px-3"><span className="chip" style={{ background: ws.bg, color: ws.color, fontSize: 12 }}>{ws.label}</span></td>
                    <td className="py-3 px-3" style={{ whiteSpace: 'nowrap' }}>
                      {row.deadline ? (
                        <div>
                          <div style={deadlineStyle(row)}>{row.deadline}</div>
                          {deadlineHint(row) ? <div className="text-meta" style={{ color: deadlineStyle(row)?.color ?? 'var(--text-muted)' }}>{deadlineHint(row)}</div> : null}
                        </div>
                      ) : '—'}
                    </td>
                    {isAdmin ? (
                      <>
                        <td className="py-3 px-3">
                          <span className="text-meta" style={{ color: payState.color, fontWeight: 500 }}>{payState.label}</span>
                          {paidMethods.length > 0 ? (
                            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{paidMethods.map((m) => METHOD_LABEL[m] ?? m).join(', ')}</div>
                          ) : null}
                        </td>
                        <td className="py-3 px-3">
                          {ps.length === 0 ? (
                            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>—</span>
                          ) : (
                            <div className="flex gap-1 flex-wrap">
                              {advance.length > 0 ? <MilestoneChip label="Avans" on={allPaid(advance)} /> : null}
                              {interim.length > 0 ? <MilestoneChip label={`Ara×${interim.length}`} on={allPaid(interim)} /> : null}
                              {fin.length > 0 ? <MilestoneChip label="Final" on={allPaid(fin)} /> : null}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{amount != null ? formatAZN(amount) : '—'}</td>
                        <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums', color: paid > 0 ? 'var(--success-deep, #1d7a44)' : 'var(--text-muted)' }}>{formatAZN(paid)}</td>
                        <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums', color: (remaining ?? 0) > 0 ? 'var(--error-deep, #b3261e)' : 'var(--text-muted)', fontWeight: (remaining ?? 0) > 0 ? 600 : 400 }}>{remaining != null ? formatAZN(remaining) : '—'}</td>
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
                    </Fragment>
                  );
                });
              })()}
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
        <OutsourceModal
          item={editItem}
          initialPayments={editItem ? paymentsOf(editItem.id) : []}
          onClose={() => { setCreateOpen(false); setEditItem(null); }}
        />
      ) : null}
    </>
  );
}

function MilestoneChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="chip" style={{ fontSize: 11, padding: '2px 7px', background: on ? 'var(--success-bg, #e6f4ea)' : 'var(--surface-mist)', color: on ? 'var(--success-deep, #1d7a44)' : 'var(--text-muted)', border: on ? '1px solid var(--success-deep, #1d7a44)' : '1px solid var(--line)', whiteSpace: 'nowrap' }}>
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

type DraftPayment = { kind: PaymentKind; amount: string; method: string; is_paid: boolean };

function OutsourceModal({ item, initialPayments, onClose }: { item: OutsourceRow | null; initialPayments: OutsourcePayment[]; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!item;
  const [workTitle, setWorkTitle] = useState(item?.work_title ?? '');
  const [contactCompany, setContactCompany] = useState(item?.contact_company ?? '');
  const [contactPerson, setContactPerson] = useState(item?.contact_person ?? '');
  const [discipline, setDiscipline] = useState(item?.discipline ?? '');
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : '');
  const [deadline, setDeadline] = useState(item?.deadline ?? '');
  const [status, setStatus] = useState<Status>(item?.status ?? 'order');
  const [projectId, setProjectId] = useState<string>(item?.project_id ?? '');
  const [payments, setPayments] = useState<DraftPayment[]>(
    [...initialPayments]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ kind: p.kind, amount: String(p.amount), method: p.method ?? '', is_paid: p.is_paid })),
  );

  const projects = useQuery({
    queryKey: ['projects', 'active-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name').is('archived_at', null).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const addPayment = (kind: PaymentKind) => setPayments((d) => [...d, { kind, amount: '', method: '', is_paid: false }]);
  const updatePayment = (i: number, patch: Partial<DraftPayment>) => setPayments((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const removePayment = (i: number) => setPayments((d) => d.filter((_, j) => j !== i));

  const contractNum = Number(amount) || 0;
  const paidSum = payments.filter((p) => p.is_paid).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, contractNum - paidSum);

  const save = useMutation({
    mutationFn: async () => {
      if (!workTitle.trim()) throw new Error('İş adı tələb olunur');
      const amt = amount.trim() ? Number(amount) : null;
      if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) throw new Error('Müqavilə məbləği 0-dan böyük olmalıdır');
      for (const [i, p] of payments.entries()) {
        const n = Number(p.amount);
        if (!p.amount.trim() || !Number.isFinite(n) || n <= 0) throw new Error(`${i + 1}-ci ödənişin məbləği 0-dan böyük olmalıdır`);
        // A payment marked paid must record HOW it was paid.
        if (p.is_paid && !p.method) throw new Error(`${i + 1}-ci ödəniş "Ödənilib" işarələnib — ödəniş üsulunu (nağd/köçürmə) seçin`);
      }
      const itemPayload = {
        work_title: workTitle.trim(),
        contact_company: contactCompany.trim() || null,
        contact_person: contactPerson.trim() || null,
        discipline: discipline.trim() || null,
        amount: amt,
        deadline: deadline || null,
        status,
        project_id: projectId || null,
      };

      // 1. Upsert the item, getting its id (needed to attach payments on create).
      let itemId = item?.id;
      if (isEdit) {
        const { error } = await supabase.from('outsource_items').update(itemPayload).eq('id', item!.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('outsource_items').insert(itemPayload).select('id').single();
        if (error) throw error;
        itemId = data.id as string;
      }

      // 2. Replace the payment set (delete-all + reinsert keeps it simple and
      //    correct for the handful of rows a subcontract has).
      if (isEdit) {
        const { error: delErr } = await supabase.from('outsource_payments').delete().eq('outsource_item_id', itemId!);
        if (delErr) throw delErr;
      }
      if (payments.length > 0) {
        const insertRows = payments.map((p, i) => ({
          outsource_item_id: itemId!,
          kind: p.kind,
          amount: Number(p.amount),
          method: p.method || null,
          is_paid: p.is_paid,
          paid_at: p.is_paid ? new Date().toISOString() : null,
          sort_order: i,
        }));
        const { error: insErr } = await supabase.from('outsource_payments').insert(insertRows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outsource'] });
      qc.invalidateQueries({ queryKey: ['outsource-payments'] });
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
      <div className="card w-full max-w-xl" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
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
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Müqavilə (AZN)</span>
              <input type="number" min="0.01" step="0.01" className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İş statusu</span>
              <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Deadline</span>
              <input type="date" className="input w-full" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Əlaqə şəxsi (podratçı tərəfdən)</span>
            <input className="input w-full" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="məs. Fərid bəy" />
          </label>

          {/* Payments / milestones editor — the heart of the feature */}
          <div className="rounded-card" style={{ border: '1px solid var(--line)', padding: 12 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-meta font-medium" style={{ color: 'var(--text)' }}>Ödənişlər (mərhələlər)</span>
              <div className="flex gap-1">
                {(['advance', 'interim', 'final'] as const).map((k) => (
                  <button key={k} type="button" className="chip" style={{ fontSize: 11 }} onClick={() => addPayment(k)}>+ {KIND_LABEL[k]}</button>
                ))}
              </div>
            </div>
            {payments.length === 0 ? (
              <p className="text-meta py-2" style={{ color: 'var(--text-muted)' }}>Hələ ödəniş yoxdur — yuxarıdakı düymələrlə Avans/Ara/Final əlavə et.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select className="input" style={{ width: 96, height: 34 }} aria-label="Mərhələ" value={p.kind} onChange={(e) => updatePayment(i, { kind: e.target.value as PaymentKind })}>
                      {(['advance', 'interim', 'final'] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <input type="number" min="0.01" step="0.01" className="input" style={{ width: 120, height: 34 }} placeholder="Məbləğ" aria-label="Məbləğ" value={p.amount} onChange={(e) => updatePayment(i, { amount: e.target.value })} />
                    <select
                      className="input"
                      style={{ width: 140, height: 34, ...(p.is_paid && !p.method ? { borderColor: 'var(--error-deep)' } : {}) }}
                      aria-label="Ödəniş üsulu"
                      title={p.is_paid && !p.method ? 'Ödənilib seçilib — üsul tələb olunur' : undefined}
                      value={p.method}
                      onChange={(e) => updatePayment(i, { method: e.target.value })}
                    >
                      <option value="">Üsul —</option>
                      {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-meta" style={{ color: p.is_paid ? 'var(--success-deep, #1d7a44)' : 'var(--text-muted)' }}>
                      <input type="checkbox" checked={p.is_paid} onChange={(e) => updatePayment(i, { is_paid: e.target.checked })} />
                      Ödənilib
                    </label>
                    <button type="button" className="chip opacity-60 hover:opacity-100" style={{ color: 'var(--error-deep)', fontSize: 13 }} onClick={() => removePayment(i)} title="Sil" aria-label={`${i + 1}-ci ödənişi sil`}>×</button>
                  </div>
                ))}
              </div>
            )}
            {/* Live summary */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 text-meta" style={{ borderTop: '1px solid var(--line-soft)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Müqavilə: <b style={{ color: 'var(--text)' }}>{formatAZN(contractNum)}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>Ödənilib: <b style={{ color: 'var(--success-deep, #1d7a44)' }}>{formatAZN(paidSum)}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>Qalıq: <b style={{ color: remaining > 0 ? 'var(--error-deep, #b3261e)' : 'var(--text)' }}>{formatAZN(remaining)}</b></span>
              {contractNum > 0 && paidSum > contractNum ? <span style={{ color: 'var(--warning, #c47d00)' }}>⚠ Ödənilən müqavilədən çoxdur</span> : null}
            </div>
          </div>

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
