import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN } from '@/lib/format';
import { useSlashFocus } from '@/lib/useSlashFocus';
import { downloadCsv } from '@/lib/csv';

const STATUS_LABEL = { order: 'Sifariş', in_progress: 'İcrada', delivered: 'Təhvil', paid: 'Ödənildi' } as const;
type Status = keyof typeof STATUS_LABEL;

const STATUS_NEXT: Partial<Record<Status, Status>> = {
  order: 'in_progress',
  in_progress: 'delivered',
  delivered: 'paid',
};

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
  const [createOpen, setCreateOpen] = useState(false);
  // PRD §UX — free-text search across work_title (consistency with other list pages)
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);
  // PRD §UX — sort dropdown (deadline default, status, amount for admin)
  const [sortBy, setSortBy] = useState<'deadline' | 'status' | 'amount'>('deadline');
  // PRD §UX — status filter chips
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  // PRD §UX — quick "due within 7 days" filter
  const [dueWeekOnly, setDueWeekOnly] = useState(false);

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async () => {
      const { data, error } = await supabase.from(view as 'outsource_items').select('*').order('deadline', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // PRD §UX — resolve project_id → project name so the table doesn't show UUIDs.
  // Separate query (kept simple) instead of an embed; cached for 5 min.
  const projects = useQuery({
    queryKey: ['outsource-projects-map'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name');
      return new Map((data ?? []).map((p) => [p.id, p.name]));
    },
  });
  const projectName = (id: string | null | undefined) =>
    (id && projects.data?.get(id)) || '—';

  const advanceStatus = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: Status }) => {
      const { error } = await supabase
        .from('outsource_items')
        .update({ status: nextStatus })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outsource'] }),
  });

  // PRD §REQ-FIN-07 — admin can delete a podrat row (RLS-scoped); inline confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('outsource_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outsource'] });
      setConfirmDeleteId(null);
    },
  });

  const headers = ['İş', 'Layihə', 'Deadline', 'Status / İrəlilə', ...(isAdmin ? ['Məbləğ', 'Ödəniş tarixi', ''] : [])];

  return (
    <>
      <PageHead
        meta={
          isAdmin
            ? (() => {
                const rows = (q.data as Array<{ amount?: number; status?: string; paid_at?: string | null }> ?? []);
                const total = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
                const unpaid = rows.filter((r) => r.status !== 'paid');
                const unpaidSum = unpaid.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
                if (unpaid.length === 0) return `Admin görünüşü · cəmi ${formatAZN(total)}`;
                return `Admin görünüşü · ${formatAZN(unpaidSum)} ödənilməyib · cəmi ${formatAZN(total)}`;
              })()
            : 'İstifadəçi görünüşü (məbləğlər gizlidir)'
        }
        title="Podrat İşləri"
        actions={
          <>
            <input
              ref={searchRef}
              className="input max-w-[220px]"
              placeholder="Axtar… (/)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input"
              style={{ maxWidth: 160, height: 32, fontSize: 12 }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sıralama"
            >
              <option value="deadline">↑ Son tarix</option>
              <option value="status">Status</option>
              {isAdmin ? <option value="amount">Məbləğ (böyük əvvəl)</option> : null}
            </select>
            {isAdmin && (q.data ?? []).length > 0 ? (
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  downloadCsv(
                    `podrat-${new Date().toISOString().slice(0, 10)}.csv`,
                    ['İş', 'Layihə', 'Status', 'Deadline', 'Məbləğ'],
                    (q.data as Array<{ work_title?: string; project_id?: string | null; status?: string; deadline?: string | null; amount?: number }>).map((r) => ({
                      'İş': r.work_title ?? '',
                      'Layihə': projectName(r.project_id),
                      'Status': STATUS_LABEL[r.status as Status] ?? r.status ?? '',
                      'Deadline': r.deadline ?? '',
                      'Məbləğ': r.amount ?? '',
                    })),
                  );
                }}
              >
                ↓ CSV
              </button>
            ) : null}
            {isAdmin ? <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Yeni</button> : null}
          </>
        }
      />
      {/* PRD §REQ-FIN-07 — admin spend breakdown by responsible person */}
      {isAdmin && (q.data ?? []).length > 0 ? (
        <div className="card mb-4">
          <h3 className="text-h3 mb-2">Məsul şəxslər üzrə xərc</h3>
          {(() => {
            // Aggregate amounts per responsible_user_id
            const buckets = new Map<string, { count: number; total: number; paid: number }>();
            for (const row of q.data as Array<{ responsible_user_id?: string | null; amount?: number; paid_at?: string | null }>) {
              const key = row.responsible_user_id ?? 'unassigned';
              const cur = buckets.get(key) ?? { count: 0, total: 0, paid: 0 };
              cur.count += 1;
              cur.total += Number(row.amount ?? 0);
              if (row.paid_at) cur.paid += Number(row.amount ?? 0);
              buckets.set(key, cur);
            }
            const rows = Array.from(buckets.entries()).sort((a, b) => b[1].total - a[1].total);
            const max = Math.max(1, ...rows.map(([, v]) => v.total));
            return (
              <ul className="space-y-1.5">
                {rows.slice(0, 8).map(([id, v]) => (
                  <li key={id} className="flex items-center gap-3 text-meta">
                    <span className="w-32 shrink-0 truncate" style={{ color: 'var(--text-muted)' }}>
                      {id === 'unassigned' ? '— təyin edilməyib —' : id.slice(0, 8)}
                    </span>
                    <div className="flex-1 h-4 rounded-full" style={{ background: 'var(--line-soft)' }}>
                      <div
                        style={{
                          width: `${(v.total / max) * 100}%`,
                          height: '100%',
                          background: 'var(--brand-action)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span className="w-32 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {v.total.toLocaleString('az-AZ')} ({v.count})
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ) : null}

      {/* PRD §UX — quick status filter chips */}
      {(q.data ?? []).length > 0 ? (
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'order', 'in_progress', 'delivered', 'paid'] as const).map((s) => {
            const count = s === 'all'
              ? (q.data ?? []).length
              : (q.data as Array<{ status?: string }>).filter((r) => r.status === s).length;
            return (
              <button
                key={s}
                type="button"
                className="chip"
                style={{
                  background: statusFilter === s ? 'var(--brand-action)' : 'var(--surface-mist)',
                  color: statusFilter === s ? 'var(--ink)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: statusFilter === s ? 600 : 400,
                  opacity: count === 0 && s !== 'all' ? 0.4 : 1,
                }}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'Hamısı' : STATUS_LABEL[s]} · {count}
              </button>
            );
          })}
          {/* PRD §UX — due-within-7-days quick filter */}
          <button
            type="button"
            className="chip"
            style={{
              background: dueWeekOnly ? 'var(--brand-action)' : 'var(--surface-mist)',
              color: dueWeekOnly ? 'var(--ink)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: dueWeekOnly ? 600 : 400,
            }}
            onClick={() => setDueWeekOnly((v) => !v)}
            title="Növbəti 7 gün ərzində bitənləri göstər"
          >
            {dueWeekOnly ? '✓ Bu həftə' : 'Bu həftə'}
          </button>
        </div>
      ) : null}
      {(q.data ?? []).length === 0 ? (
        <EmptyState
          title="Podrat işi yoxdur"
          body="Sifariş yarat və icraçıya təhvil ver."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                + İlk sifarişi yarat
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {headers.map((h) => {
                  // PRD §UX — header click cycles sort key for sortable columns
                  const sortableKey: typeof sortBy | null =
                    h === 'Deadline' ? 'deadline'
                    : h === 'Status / İrəlilə' ? 'status'
                    : h === 'Məbləğ' ? 'amount'
                    : null;
                  const isActive = sortableKey === sortBy;
                  return (
                    <th
                      key={h}
                      className="text-left py-3 px-3 text-meta"
                      style={{
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: sortableKey ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      onClick={() => { if (sortableKey) setSortBy(sortableKey); }}
                      title={sortableKey ? `${h}-ə görə sırala` : undefined}
                    >
                      {h}
                      {isActive ? (
                        <span style={{ color: 'var(--brand-text)', marginLeft: 2 }}> ↓</span>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const visibleCount = (q.data as any[])
                  .filter((row) => statusFilter === 'all' || row.status === statusFilter)
                  .filter((row) => {
                    if (!dueWeekOnly) return true;
                    if (!row.deadline) return false;
                    const days = Math.round(
                      (new Date(row.deadline).getTime() - Date.now()) / 86_400_000,
                    );
                    return days >= 0 && days <= 7;
                  })
                  .filter((row) => !search.trim() || (row.work_title ?? '').toLowerCase().includes(search.trim().toLowerCase()))
                  .length;
                if (visibleCount > 0) return null;
                return (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 4} className="py-6 text-center text-meta" style={{ color: 'var(--text-muted)' }}>
                      Filtrə uyğun sifariş yoxdur.{' '}
                      <button
                        type="button"
                        className="underline"
                        style={{ color: 'var(--brand-text)' }}
                        onClick={() => { setStatusFilter('all'); setDueWeekOnly(false); setSearch(''); }}
                      >
                        Filtrləri sıfırla
                      </button>
                    </td>
                  </tr>
                );
              })()}
              {(q.data as any[])
                .filter((row) => statusFilter === 'all' || row.status === statusFilter)
                .filter((row) => {
                  if (!dueWeekOnly) return true;
                  if (!row.deadline) return false;
                  const days = Math.round(
                    (new Date(row.deadline).getTime() - Date.now()) / 86_400_000,
                  );
                  return days >= 0 && days <= 7;
                })
                .filter((row) => !search.trim() || (row.work_title ?? '').toLowerCase().includes(search.trim().toLowerCase()))
                .sort((a, b) => {
                  if (sortBy === 'status') return String(a.status ?? '').localeCompare(String(b.status ?? ''));
                  if (sortBy === 'amount') return Number(b.amount ?? 0) - Number(a.amount ?? 0);
                  // deadline: nulls last, ascending
                  return String(a.deadline ?? '￿').localeCompare(String(b.deadline ?? '￿'));
                })
                .map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface-mist transition-colors"
                  style={{ borderBottom: '1px solid var(--line-soft)' }}
                >
                  <td className="py-3 px-3">{row.work_title}</td>
                  <td className="py-3 px-3 truncate max-w-[180px]" title={row.project_id ?? ''}>
                    {row.project_id ? (
                      <a
                        href={`/layihelər/${row.project_id}`}
                        className="hover:underline"
                        style={{ color: 'var(--brand-text)' }}
                      >
                        {projectName(row.project_id)}
                      </a>
                    ) : '—'}
                  </td>
                  {/* PRD §UX — overdue podrat deadline red, ≤3d amber + days-left tooltip */}
                  <td
                    className="py-3 px-3"
                    style={(() => {
                      if (!row.deadline || row.status === 'paid') return undefined;
                      const today = new Date().toISOString().slice(0, 10);
                      if (row.deadline < today) {
                        return { color: 'var(--error-deep, #b3261e)', fontWeight: 600 };
                      }
                      const days = Math.round(
                        (new Date(row.deadline).getTime() - Date.now()) / 86_400_000,
                      );
                      if (days >= 0 && days <= 3) return { color: 'var(--warning, #c47d00)' };
                      return undefined;
                    })()}
                    title={(() => {
                      if (!row.deadline) return undefined;
                      const days = Math.round(
                        (new Date(row.deadline).getTime() - Date.now()) / 86_400_000,
                      );
                      if (days < 0) return `${Math.abs(days)} gün gecikib`;
                      if (days === 0) return 'Bu gün';
                      return `${days} gün qaldı`;
                    })()}
                  >
                    {row.deadline ?? '—'}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="chip"
                        style={{ background: 'var(--surface-mist)', color: 'var(--text)', fontSize: 12 }}
                        title={(() => {
                          // PRD §REQ-FIN-07 — explain next workflow step on hover,
                          // OR show paid_at date when row is fully paid.
                          if (row.status === 'paid' && (row as { paid_at?: string | null }).paid_at) {
                            return `Ödənilib: ${new Date((row as { paid_at: string }).paid_at).toLocaleDateString('az-AZ')}`;
                          }
                          const next = STATUS_NEXT[row.status as Status];
                          return next ? `Növbəti: ${STATUS_LABEL[next]}` : 'Workflow tamamlanıb';
                        })()}
                      >
                        {STATUS_LABEL[row.status as Status] ?? row.status}
                      </span>
                      {STATUS_NEXT[row.status as Status] ? (
                        <button
                          className="text-meta hover:underline"
                          style={{ color: 'var(--brand-text)', fontSize: 12 }}
                          disabled={advanceStatus.isPending}
                          onClick={() =>
                            advanceStatus.mutate({
                              id: row.id,
                              nextStatus: STATUS_NEXT[row.status as Status]!,
                            })
                          }
                        >
                          → {STATUS_LABEL[STATUS_NEXT[row.status as Status]!]}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {isAdmin ? (
                    <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(row.amount)}
                    </td>
                  ) : null}
                  {isAdmin ? (
                    <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {row.paid_at
                        ? new Date(row.paid_at as string).toLocaleDateString('az-AZ')
                        : '—'}
                    </td>
                  ) : null}
                  {isAdmin ? (
                    <td className="py-3 px-3 text-right">
                      {confirmDeleteId === row.id ? (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            className="chip"
                            style={{ background: 'var(--error-deep)', color: 'white', fontSize: 11 }}
                            disabled={deleteItem.isPending}
                            onClick={() => deleteItem.mutate(row.id)}
                          >
                            {deleteItem.isPending ? '…' : 'Bəli'}
                          </button>
                          <button
                            type="button"
                            className="chip"
                            style={{ fontSize: 11 }}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            ×
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="chip opacity-50 hover:opacity-100"
                          style={{ color: 'var(--error-deep)', fontSize: 13 }}
                          onClick={() => setConfirmDeleteId(row.id)}
                          title="Sil"
                          aria-label={`Sifarişi sil: ${row.work_title}`}
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            {/* PRD §REQ-FIN-07 — footer total mirrors the meta but lives next to amounts */}
            {isAdmin ? (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td colSpan={3} className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                    Cəmi (görünən)
                  </td>
                  <td className="py-3 px-3" />
                  <td className="py-3 px-3 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAZN(
                      (q.data as Array<{ work_title?: string; amount?: number; status?: string }>)
                        .filter((r) => statusFilter === 'all' || r.status === statusFilter)
                        .filter((r) => !search.trim() || (r.work_title ?? '').toLowerCase().includes(search.trim().toLowerCase()))
                        .reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
                    )}
                  </td>
                  <td className="py-3 px-3" />
                  <td className="py-3 px-3" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
      {createOpen && isAdmin ? <CreateOutsourceModal onClose={() => setCreateOpen(false)} /> : null}
    </>
  );
}

function CreateOutsourceModal({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [workTitle, setWorkTitle] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<Status>('order');
  const [projectId, setProjectId] = useState<string>('');
  const [responsibleUserId, setResponsibleUserId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');

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

  const create = useMutation({
    mutationFn: async () => {
      if (!workTitle.trim()) throw new Error('İş adı tələb olunur');
      const { error } = await supabase.from('outsource_items').insert({
        work_title: workTitle.trim(),
        contact_company: contactCompany.trim() || null,
        contact_person: contactPerson.trim() || null,
        amount: amount ? Number(amount) : null,
        deadline: deadline || null,
        status,
        project_id: projectId || null,
        responsible_user_id: responsibleUserId || null,
        payment_method: isAdmin ? paymentMethod || null : null,
      });
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
      aria-label="Yeni podrat işi"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h3 mb-4">Yeni podrat işi</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İş adı *</span>
            <input className="input w-full" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Layihə</span>
            <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— seç —</option>
              {(projects.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Şirkət</span>
              <input className="input w-full" value={contactCompany} onChange={(e) => setContactCompany(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Əlaqə şəxsi</span>
              <input className="input w-full" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Məbləğ (AZN)</span>
              <input type="number" className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Müddət</span>
              <input type="date" className="input w-full" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
            <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Məsul şəxs</span>
            <select className="input w-full" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
              <option value="">— seç —</option>
              {(profiles.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
              ))}
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
          {create.error ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{(create.error as Error).message}</p>
          ) : null}
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button className="btn-ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}
