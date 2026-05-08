import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN } from '@/lib/format';

const STATUS_LABEL = { order: 'Sifariş', in_progress: 'İcrada', delivered: 'Təhvil', paid: 'Ödənildi' } as const;

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async () => {
      const { data, error } = await supabase.from(view as 'outsource_items').select('*').order('deadline', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
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
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İş', 'Layihə', 'Deadline', 'Status', ...(isAdmin ? ['Məbləğ'] : [])].map((h) => (
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
              {(q.data as any[]).map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{row.work_title}</td>
                  <td className="py-3 px-3">{row.project_id ?? '—'}</td>
                  <td className="py-3 px-3">{row.deadline ?? '—'}</td>
                  <td className="py-3 px-3">{STATUS_LABEL[row.status as keyof typeof STATUS_LABEL] ?? row.status}</td>
                  {isAdmin ? (
                    <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(row.amount)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
