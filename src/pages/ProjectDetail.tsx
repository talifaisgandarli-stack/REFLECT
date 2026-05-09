import { useParams, Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { useProject, useTasks } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';
import { CloseoutPanel } from '@/components/CloseoutPanel';
import { ProjectDocuments } from '@/components/ProjectDocuments';
import { PortfolioPanel } from '@/components/PortfolioPanel';
import { ProjectEditModal } from '@/components/ProjectEditModal';
import { useT } from '@/lib/i18n';

type Tab =
  | 'overview'
  | 'tasks'
  | 'documents'
  | 'finance'
  | 'closeout'
  | 'portfolio'
  | 'history';
const TABS_BASE: Tab[] = ['overview', 'tasks', 'documents', 'closeout', 'portfolio', 'history'];

export function ProjectDetailPage() {
  const tr = useT();
  const { id } = useParams();
  const { data: project } = useProject(id);
  const { data: tasks = [] } = useTasks({ projectId: id });
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const tabs: Tab[] = isAdmin
    ? [...TABS_BASE.slice(0, 3), 'finance', ...TABS_BASE.slice(3)]
    : TABS_BASE;

  if (!project) {
    return (
      <div className="card text-meta">
        {tr('projects.detail.not_found')} <Link to="/layihelər">{tr('common.back')}</Link>
      </div>
    );
  }

  return (
    <>
      <PageHead
        meta={(project.phases ?? []).join(' → ') || '—'}
        title={project.name}
        actions={
          <button className="btn-outline" onClick={() => setEditing(true)}>
            {tr('projects.edit.cta')}
          </button>
        }
      />

      <nav className="flex gap-2 mb-6 border-b border-line-soft">
        {tabs.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className="px-4 py-2 text-ui"
            style={{
              color: tab === tabKey ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: tab === tabKey ? '2px solid var(--brand-text)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tr(`projects.detail.tab.${tabKey}`)}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <h3 className="text-h3 mb-3">{tr('projects.detail.phases_title')}</h3>
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
            <h3 className="text-h3 mb-3">{tr('projects.detail.facts_title')}</h3>
            <dl className="text-body space-y-2">
              <Row
                k={tr('projects.detail.row.status')}
                v={tr(`projects.status.${project.status}`)}
              />
              <Row k={tr('projects.detail.row.start')} v={project.start_date ?? '—'} />
              <Row k={tr('projects.detail.row.deadline')} v={project.deadline ?? '—'} />
              <Row
                k={tr('projects.detail.row.expertise')}
                v={
                  project.requires_expertise
                    ? tr('projects.detail.expertise_yes')
                    : tr('projects.detail.expertise_no')
                }
              />
            </dl>
          </div>
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="card">
          {tasks.length === 0 ? (
            <p className="text-meta">{tr('projects.detail.tasks_empty')}</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.map((task) => (
                <li key={task.id} className="py-3 flex items-center justify-between">
                  <span>{task.title}</span>
                  <StatusChip status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'finance' && id ? <ProjectPnL projectId={id} /> : null}

      {tab === 'closeout' && id ? (
        <CloseoutPanel projectId={id} projectStatus={project.status} />
      ) : null}

      {tab === 'documents' && id ? <ProjectDocuments projectId={id} /> : null}

      {tab === 'portfolio' && id ? <PortfolioPanel projectId={id} /> : null}

      {tab === 'history' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tr('projects.detail.history_placeholder')}
        </div>
      ) : null}

      {editing ? (
        <ProjectEditModal project={project} onClose={() => setEditing(false)} />
      ) : null}
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
