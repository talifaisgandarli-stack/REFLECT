/**
 * REQ-ARC-01 — filters by project / assignee / date range / status
 * REQ-ARC-02 — admin Restore (clears archived_at / reopens project)
 * REQ-ARC-03 — user scope: own tasks + projects; admin: everything
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { TASK_STATUS_LABEL } from '@/lib/labels';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Project, Task } from '@/types/db';

export function ArchivePage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();

  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const profiles = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async () => (await supabase.from('profiles').select('id, full_name')).data ?? [],
  });

  const projects = useQuery({
    queryKey: ['archive', 'projects'],
    queryFn: async (): Promise<Project[]> => {
      // RLS policy (projects_select): is_admin() OR is_project_member(id)
      // — Supabase already filters to only the rows this user may see.
      // Applying an additional created_by filter here was overly restrictive:
      // team members assigned to a project but not the creator were excluded.
      const q = supabase.from('projects').select('*').eq('status', 'closed').order('archived_at', { ascending: false }).limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const tasks = useQuery({
    queryKey: ['archive', 'tasks'],
    queryFn: async (): Promise<Task[]> => {
      let q = supabase.from('tasks').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(500);
      if (!isAdmin && profile?.id) q = q.contains('assignee_ids', [profile.id]);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const restoreTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').update({ archived_at: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive', 'tasks'] }),
  });

  const restoreProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').update({ status: 'active', archived_at: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive', 'projects'] }),
  });

  const filteredTasks = useMemo(() => {
    return (tasks.data ?? []).filter((t) => {
      if (projectId && t.project_id !== projectId) return false;
      if (assigneeId && !t.assignee_ids.includes(assigneeId)) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (dateFrom && t.archived_at && t.archived_at < dateFrom) return false;
      if (dateTo && t.archived_at && t.archived_at > dateTo + 'T23:59:59.999Z') return false;
      return true;
    });
  }, [tasks.data, projectId, assigneeId, statusFilter, dateFrom, dateTo]);

  const filteredProjects = useMemo(() => {
    return (projects.data ?? []).filter((p) => {
      if (projectId && p.id !== projectId) return false;
      if (dateFrom && p.archived_at && p.archived_at < dateFrom) return false;
      if (dateTo && p.archived_at && p.archived_at > dateTo + 'T23:59:59.999Z') return false;
      return true;
    });
  }, [projects.data, projectId, dateFrom, dateTo]);

  const empty = !tasks.isLoading && !projects.isLoading && filteredTasks.length === 0 && filteredProjects.length === 0;

  return (
    <>
      <PageHead meta="Yalnız oxunan görünüş" title="Arxiv" />

      {/* REQ-ARC-01 — filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select className="input max-w-[180px]" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Bütün layihələr</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className="input max-w-[180px]" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Bütün icraçılar</option>
          {(profiles.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
          ))}
        </select>
        <select className="input max-w-[160px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Bütün statuslar</option>
          {(['done', 'cancelled'] as const).map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <input type="date" className="input max-w-[160px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="input max-w-[160px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        {(projectId || assigneeId || statusFilter || dateFrom || dateTo) ? (
          <button className="btn-outline" onClick={() => { setProjectId(''); setAssigneeId(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); }}>
            Sıfırla
          </button>
        ) : null}
      </div>

      {empty ? (
        <EmptyState title="Arxiv boşdur" body="Arxivlənmiş tapşırıqlar və bağlanmış layihələr burada görünəcək." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="card">
            <h3 className="text-h3 mb-3">Tapşırıqlar ({filteredTasks.length})</h3>
            <ul className="divide-y divide-line-soft">
              {filteredTasks.map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-body">{t.title}</div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {TASK_STATUS_LABEL[t.status]} · {t.archived_at?.slice(0, 10) ?? '—'}
                    </div>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="chip"
                      style={{ whiteSpace: 'nowrap' }}
                      disabled={restoreTask.isPending}
                      onClick={() => restoreTask.mutate(t.id)}
                    >
                      Bərpa et
                    </button>
                  ) : null}
                </li>
              ))}
              {filteredTasks.length === 0 ? (
                <li className="py-4 text-meta text-center" style={{ color: 'var(--text-muted)' }}>Tapşırıq yoxdur</li>
              ) : null}
            </ul>
          </section>

          <section className="card">
            <h3 className="text-h3 mb-3">Layihələr ({filteredProjects.length})</h3>
            <ul className="divide-y divide-line-soft">
              {filteredProjects.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-body">{p.name}</div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {p.archived_at?.slice(0, 10) ?? '—'}
                    </div>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="chip"
                      style={{ whiteSpace: 'nowrap' }}
                      disabled={restoreProject.isPending}
                      onClick={() => restoreProject.mutate(p.id)}
                    >
                      Bərpa et
                    </button>
                  ) : null}
                </li>
              ))}
              {filteredProjects.length === 0 ? (
                <li className="py-4 text-meta text-center" style={{ color: 'var(--text-muted)' }}>Layihə yoxdur</li>
              ) : null}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
