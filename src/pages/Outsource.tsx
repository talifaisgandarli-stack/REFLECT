/**
 * Outsource hybrid workflow — REQ-FIN-07.
 *
 * Admins see all columns including amount.
 * Non-admins (responsible_user_id) see operational columns only — amounts hidden.
 * Both can advance status: Sifariş → İcra → Təhvil → Ödənildi.
 * Status change uses advance_outsource_status() RPC (security-definer) so
 * non-admins never touch the admin-gated outsource_items table directly.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const STATUS_NEXT: Record<OutsourceStatus, OutsourceStatus | null> = {
  order: 'in_progress',
  in_progress: 'delivered',
  delivered: 'paid',
  paid: null,
};

const STATUS_COLOR: Record<OutsourceStatus, string> = {
  order: 'var(--text-muted)',
  in_progress: 'var(--brand-text)',
  delivered: '#15803D',
  paid: 'var(--text-muted)',
};

type Row = {
  id: string;
  project_id: string | null;
  work_title: string;
  contact_person: string | null;
  deadline: string | null;
  status: OutsourceStatus;
  responsible_user_id: string | null;
  amount?: number | null;
};

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [advancing, setAdvancing] = useState<string | null>(null);

  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(view as 'outsource_items')
        .select('*')
        .order('deadline', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: OutsourceStatus }) => {
      setAdvancing(id);
      const { error } = await supabase.rpc('advance_outsource_status', {
        p_item_id: id,
        p_new_status: nextStatus,
      });
      if (error) throw error;
    },
    onSettled: () => {
      setAdvancing(null);
      qc.invalidateQueries({ queryKey: ['outsource'] });
    },
  });

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü (məbləğlər var)' : 'Status güncəllənə bilər; məbləğlər gizlidir'}
        title="Podrat İşləri"
        actions={isAdmin ? <button className="btn-primary">+ Yeni</button> : null}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState title="Podrat işi yoxdur" body="Sifariş yarat və icraçıya təhvil ver." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İş', 'Əlaqə', 'Deadline', 'Status', ...(isAdmin ? ['Məbləğ'] : []), ''].map((h) => (
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
              {(q.data as Row[]).map((row) => {
                const next = STATUS_NEXT[row.status];
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-3 px-3">{row.work_title}</td>
                    <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                      {row.contact_person ?? '—'}
                    </td>
                    <td className="py-3 px-3">{formatDate(row.deadline)}</td>
                    <td className="py-3 px-3">
                      <span
                        className="text-meta"
                        style={{ color: STATUS_COLOR[row.status], fontWeight: 500 }}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatAZN(row.amount ?? null)}
                      </td>
                    ) : null}
                    <td className="py-3 px-3 text-right">
                      {next ? (
                        <button
                          className="chip chip-brand"
                          disabled={advancing === row.id}
                          onClick={() => advanceMutation.mutate({ id: row.id, nextStatus: next })}
                        >
                          {advancing === row.id ? '…' : `→ ${STATUS_LABEL[next]}`}
                        </button>
                      ) : (
                        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          ✓
                        </span>
                      )}
                    </td>
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
