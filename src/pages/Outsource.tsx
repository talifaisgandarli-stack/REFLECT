/**
 * Podrat İşləri (REQ-FIN-07).
 *
 * Admin → outsource_items (full row, amounts visible).
 * User  → outsource_user_view (no amounts) + inline status select for any
 *         row where responsible_user_id = me. The select calls the
 *         update_outsource_status RPC (migration 0008), which enforces
 *         server-side that 'paid' is admin-only and the caller owns the row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN } from '@/lib/format';
import {
  OUTSOURCE_STATUS_LABEL,
  OUTSOURCE_STATUS_ORDER,
  type OutsourceStatus,
} from '@/lib/finance';

type Row = {
  id: string;
  project_id: string | null;
  work_title: string;
  contact_person?: string | null;
  deadline: string | null;
  status: OutsourceStatus;
  responsible_user_id: string | null;
  amount?: number;
};

export function OutsourcePage() {
  const { isAdmin, profile } = useAuth();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from(view as 'outsource_items')
        .select('*')
        .order('deadline', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; status: OutsourceStatus }) => {
      const { error } = await supabase.rpc('update_outsource_status', {
        p_id: input.id,
        p_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outsource'] }),
  });

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü (məbləğlər var)' : 'İstifadəçi görünüşü (məbləğlər gizlidir)'}
        title="Podrat İşləri"
        actions={isAdmin ? <button className="btn-primary">+ Yeni</button> : null}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState title="Podrat işi yoxdur" body="Sifariş yarat və icraçıya təhvil ver." />
      ) : (
        <div className="card overflow-x-auto" style={{ padding: 0 }}>
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İş', 'Layihə', 'Müddət', 'Status', ...(isAdmin ? ['Məbləğ'] : [])].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((row) => {
                const canEdit = isAdmin || row.responsible_user_id === profile?.id;
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-3 px-3">{row.work_title}</td>
                    <td className="py-3 px-3">{row.project_id ?? '—'}</td>
                    <td className="py-3 px-3">{row.deadline ?? '—'}</td>
                    <td className="py-3 px-3">
                      {canEdit ? (
                        <select
                          className="input"
                          style={{ height: 32, padding: '0 8px' }}
                          value={row.status}
                          disabled={updateStatus.isPending}
                          onChange={(e) =>
                            updateStatus.mutate({
                              id: row.id,
                              status: e.target.value as OutsourceStatus,
                            })
                          }
                        >
                          {OUTSOURCE_STATUS_ORDER.map((s) => (
                            <option
                              key={s}
                              value={s}
                              disabled={s === 'paid' && !isAdmin}
                            >
                              {OUTSOURCE_STATUS_LABEL[s]}
                              {s === 'paid' && !isAdmin ? ' (admin)' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        OUTSOURCE_STATUS_LABEL[row.status] ?? row.status
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatAZN(row.amount ?? 0)}
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
