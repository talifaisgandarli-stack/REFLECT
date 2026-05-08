import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';

export function EquipmentPage() {
  const q = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => (await supabase.from('equipment').select('*').limit(200)).data ?? [],
  });
  return (
    <>
      <PageHead
        meta={`${q.data?.length ?? 0} avadanlıq`}
        title="Avadanlıq"
        actions={<button className="btn-primary">+ Yeni</button>}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState title="Avadanlıq qeydiyyatı yoxdur" body="Texnika, kompüterlər, ploterlər — burada izlə." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Növ', 'Serial', 'Tapşırılıb', 'Vəziyyət'].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((e: any) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{e.name}</td>
                  <td className="py-3 px-3">{e.kind ?? '—'}</td>
                  <td className="py-3 px-3">{e.serial ?? '—'}</td>
                  <td className="py-3 px-3">{e.assigned_to ?? '—'}</td>
                  <td className="py-3 px-3">{e.condition ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
