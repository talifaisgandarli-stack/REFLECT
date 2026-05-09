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

const TABS = ['Overview', 'Tasks', 'Documents', 'Closeout', 'Portfolio', 'History'] as const;

export function ProjectDetailPage() {
  const tr = useT();
  const { id } = useParams();
  const { data: project } = useProject(id);
  const { data: tasks = [] } = useTasks({ projectId: id });
  const { isAdmin } = useAuth();
  type Tab = (typeof TABS)[number] | 'Finance';
  const [tab, setTab] = useState<Tab>('Overview');
  const [editing, setEditing] = useState(false);
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
        actions={
          <button className="btn-outline" onClick={() => setEditing(true)}>
            {tr('projects.edit.cta')}
          </button>
        }
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

      {tab === 'Closeout' && id ? (
        <CloseoutPanel projectId={id} projectStatus={project.status} />
      ) : null}

      {tab === 'Documents' && id ? <ProjectDocuments projectId={id} /> : null}

      {tab === 'Portfolio' && id ? <PortfolioPanel projectId={id} /> : null}

      {tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          History bölməsi v1.5-də.
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
