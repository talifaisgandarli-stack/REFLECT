import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { useProject, useTasks } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';
import { CloseoutPanel } from '@/components/CloseoutPanel';
import { PortfolioPanel } from '@/components/PortfolioPanel';
import { DocumentsPanel } from '@/components/DocumentsPanel';

const TABS = ['Overview', 'Tasks', 'Documents', 'Closeout', 'Portfel', 'History'] as const;

export function ProjectDetailPage() {
  const { id } = useParams();
  const { data: project } = useProject(id);
  const { data: tasks = [] } = useTasks({ projectId: id });
  const { isAdmin } = useAuth();
  type Tab = (typeof TABS)[number] | 'Finance';
  const [tab, setTab] = useState<Tab>('Overview');
  const tabs: Tab[] = isAdmin
    ? [...TABS.slice(0, 3), 'Finance', ...TABS.slice(3)]
    : [...TABS];

  if (!project) {
    return (
      <div className="card text-meta">
        Layihə tapılmadı. <Link to="/layihelər">geri</Link>
      </div>
    );
  }

  return (
    <>
      <PageHead
        meta={(project.phases ?? []).join(' → ') || '—'}
        title={project.name}
        actions={<button className="btn-primary">+ Sənəd əlavə et</button>}
      />

      <nav className="flex gap-2 mb-6 border-b border-line-soft">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-ui"
            style={{
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--brand-text)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <h3 className="text-h3 mb-3">Mərhələlər</h3>
            <ol className="space-y-2">
              {PROJECT_PHASES.map((p) => {
                const active = project.phases?.includes(p);
                return (
                  <li key={p} className="flex items-center gap-3">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: active ? 'var(--brand-action)' : 'var(--line)' }}
                    />
                    <span style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{p}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card">
            <h3 className="text-h3 mb-3">Əsas məlumat</h3>
            <dl className="text-body space-y-2">
              <Row k="Status" v={project.status} />
              <Row k="Başlama" v={project.start_date ?? '—'} />
              <Row k="Deadline" v={project.deadline ?? '—'} />
              <Row k="Ekspertiza" v={project.requires_expertise ? 'Lazımdır' : 'Yox'} />
            </dl>
          </div>
        </div>
      ) : null}

      {tab === 'Tasks' ? (
        <div className="card">
          {tasks.length === 0 ? (
            <p className="text-meta">Bu layihədə tapşırıq yoxdur.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between">
                  <span>{t.title}</span>
                  <StatusChip status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'Finance' && id ? <ProjectPnL projectId={id} /> : null}

      {tab === 'Closeout' && id ? <CloseoutPanel projectId={id} /> : null}

      {tab === 'Portfel' && id ? <PortfolioPanel projectId={id} /> : null}

      {tab === 'Documents' && id ? <DocumentsPanel projectId={id} /> : null}

      {tab === 'History' && id ? <HistoryPanel projectId={id} /> : null}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/**
 * Project history — filtered activity_log for this project.
 * Pulls entries where entity_type='project' and entity_id matches OR
 * any task entry whose project_id matches via the diff payload.
 */
function HistoryPanel({ projectId }: { projectId: string }) {
  const log = useQuery({
    queryKey: ['project-history', projectId],
    queryFn: async () => {
      // Pull project rows directly + task rows for tasks in this project.
      const [direct, tasks] = await Promise.all([
        supabase
          .from('activity_log')
          .select('id, action, entity_type, created_at')
          .eq('entity_type', 'project')
          .eq('entity_id', projectId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('activity_log')
          .select('id, action, entity_type, created_at, entity_id')
          .eq('entity_type', 'task')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      const taskRows = (tasks.data ?? []) as Array<{
        id: string;
        action: string;
        entity_type: string;
        created_at: string;
        entity_id: string | null;
      }>;
      const taskIds = taskRows.map((r) => r.entity_id).filter(Boolean) as string[];
      let projectTaskIds = new Set<string>();
      if (taskIds.length > 0) {
        const { data: proj } = await supabase
          .from('tasks')
          .select('id')
          .in('id', taskIds)
          .eq('project_id', projectId);
        projectTaskIds = new Set((proj ?? []).map((t: { id: string }) => t.id));
      }
      const all = [
        ...((direct.data ?? []) as Array<{
          id: string;
          action: string;
          entity_type: string;
          created_at: string;
        }>),
        ...taskRows.filter((r) => r.entity_id && projectTaskIds.has(r.entity_id)),
      ];
      return all
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100);
    },
  });

  if (!log.data || log.data.length === 0) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Bu layihə üzrə tarixçə qeydi yoxdur.
      </div>
    );
  }
  return (
    <ul className="card divide-y" style={{ borderColor: 'var(--line-soft)' }}>
      {log.data.map((e) => (
        <li key={e.id} className="py-2">
          <div className="text-body">
            {e.action} · {e.entity_type}
          </div>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {new Date(e.created_at).toLocaleString('az-AZ')}
          </div>
        </li>
      ))}
    </ul>
  );
}
