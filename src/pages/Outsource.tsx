/**
 * REQ-FIN-07 — Outsource hybrid workflow.
 * Status transitions: Sifariş → İcra → Təhvil → Ödənildi.
 * Users see operational status and can advance it (no amount columns).
 * Admins see all columns and can create new items.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN, formatDate } from '@/lib/format';

type OutsourceStatus = 'order' | 'in_progress' | 'delivered' | 'paid';

const STATUS_LABEL: Record<OutsourceStatus, string> = {
  order: 'Sifariş',
  in_progress: 'İcrada',
  delivered: 'Təhvil',
  paid: 'Ödənildi',
};

const NEXT_STATUS: Partial<Record<OutsourceStatus, OutsourceStatus>> = {
  order: 'in_progress',
  in_progress: 'delivered',
  delivered: 'paid',
};

type OutsourceRow = {
  id: string;
  work_title: string;
  project_id: string | null;
  deadline: string | null;
  status: OutsourceStatus;
  amount?: number;
  contact_person?: string | null;
  responsible_user_id?: string | null;
};

type NewItemForm = {
  work_title: string;
  deadline: string;
  amount: string;
  contact_person: string;
};

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>({
    work_title: '',
    deadline: '',
    amount: '',
    contact_person: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['outsource', isAdmin],
    queryFn: async () => {
      const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
      const { data, error } = await supabase
        .from(view as 'outsource_items')
        .select('*')
        .order('deadline', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OutsourceRow[];
    },
  });

  const advance = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: OutsourceStatus }) => {
      // Users update via outsource_items (RLS enforces responsible_user_id = auth.uid() for non-admins)
      const { error } = await supabase
        .from('outsource_items')
        .update({ status: next })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outsource'] }),
  });

  const create = useMutation({
    mutationFn: async () => {
      const amt = Number(form.amount);
      if (!form.work_title.trim()) throw new Error('İş adı tələb olunur');
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Məbləğ müsbət olmalıdır (REQ-FIN-04)');
      const { error } = await supabase.from('outsource_items').insert({
        work_title: form.work_title.trim(),
        deadline: form.deadline || null,
        amount: amt,
        contact_person: form.contact_person.trim() || null,
        status: 'order',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ work_title: '', deadline: '', amount: '', contact_person: '' });
      setFormError(null);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['outsource'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const rows = q.data ?? [];

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü (məbləğlər var)' : 'İstifadəçi görünüşü (məbləğlər gizlidir)'}
        title="Podrat İşləri"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
              + Yeni
            </button>
          ) : null
        }
      />

      {isAdmin && showForm ? (
        <form
          className="card mb-4 grid grid-cols-1 md:grid-cols-4 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="text-meta flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            İş adı
            <input
              className="input"
              value={form.work_title}
              onChange={(e) => setForm((p) => ({ ...p, work_title: e.target.value }))}
              placeholder="Fasad layihəsi"
            />
          </label>
          <label className="text-meta flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Deadline
            <input
              className="input"
              type="date"
              value={form.deadline}
              onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
            />
          </label>
          <label className="text-meta flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Məbləğ (AZN)
            <input
              className="input"
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </label>
          <label className="text-meta flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Əlaqə şəxs
            <input
              className="input"
              value={form.contact_person}
              onChange={(e) => setForm((p) => ({ ...p, contact_person: e.target.value }))}
              placeholder="Ad Soyad"
            />
          </label>
          {formError ? (
            <div className="md:col-span-4 text-meta" style={{ color: 'var(--danger, #c33)' }}>
              {formError}
            </div>
          ) : null}
          <div className="md:col-span-4 flex gap-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Əlavə edilir…' : 'Əlavə et'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>
              Ləğv et
            </button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Podrat işi yoxdur" body="Sifariş yarat və icraçıya təhvil ver." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İş', 'Deadline', 'Status', 'Əməliyyat', ...(isAdmin ? ['Məbləğ'] : [])].map(
                  (h) => (
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
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const next = NEXT_STATUS[row.status];
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-3 px-3">{row.work_title}</td>
                    <td className="py-3 px-3">{formatDate(row.deadline) ?? '—'}</td>
                    <td className="py-3 px-3">
                      <StatusChip status={row.status} />
                    </td>
                    <td className="py-3 px-3">
                      {next ? (
                        <button
                          type="button"
                          className="chip chip-brand"
                          disabled={advance.isPending}
                          onClick={() => advance.mutate({ id: row.id, next })}
                        >
                          → {STATUS_LABEL[next]}
                        </button>
                      ) : (
                        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          ✓
                        </span>
                      )}
                    </td>
                    {isAdmin ? (
                      <td
                        className="py-3 px-3"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatAZN((row as OutsourceRow & { amount: number }).amount)}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusChip({ status }: { status: OutsourceStatus }) {
  const color: Record<OutsourceStatus, string> = {
    order: 'var(--text-muted)',
    in_progress: 'var(--brand-text)',
    delivered: '#F59E0B',
    paid: '#22C55E',
  };
  return (
    <span
      className="chip"
      style={{ color: color[status] ?? 'var(--text)', borderColor: color[status] ?? 'var(--line)' }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
