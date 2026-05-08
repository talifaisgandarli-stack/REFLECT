import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { TASK_STATUS_LABEL } from '@/lib/labels';
import type { Project, Task } from '@/types/db';

export function ArchivePage() {
  const tasks = useQuery({
    queryKey: ['archive', 'tasks'],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const projects = useQuery({
    queryKey: ['archive', 'projects'],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'closed')
        .order('archived_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const empty =
    !tasks.isLoading && !projects.isLoading && (tasks.data?.length ?? 0) === 0 && (projects.data?.length ?? 0) === 0;

  return (
    <>
      <PageHead
        meta="Yalnız oxunan görünüş"
        title="Arxiv"
        actions={
          <>
            <input className="input max-w-[240px]" placeholder="Layihə / icraçı / tarix…" />
          </>
        }
      />
      {empty ? (
        <EmptyState title="Arxiv boşdur" body="Tamamlanmış tapşırıqlar və bağlanmış layihələr burada görünəcək." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="card">
            <h3 className="text-h3 mb-3">Tapşırıqlar</h3>
            <ul className="divide-y divide-line-soft">
              {(tasks.data ?? []).map((t) => (
                <li key={t.id} className="py-2 flex justify-between text-body">
                  <span>{t.title}</span>
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h3 className="text-h3 mb-3">Layihələr</h3>
            <ul className="divide-y divide-line-soft">
              {(projects.data ?? []).map((p) => (
                <li key={p.id} className="py-2 flex justify-between text-body">
                  <span>{p.name}</span>
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {p.archived_at?.slice(0, 10) ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
