import { useParams, Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { useProject, useTasks } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';
import { ProposalCreateModal } from '@/components/ProposalCreateModal';

const TABS = ['Overview', 'Tasks', 'Proposals', 'Documents', 'Closeout', 'History'] as const;

export function ProjectDetailPage() {
  const { id } = useParams();
  const { data: project } = useProject(id);
  const { data: tasks = [] } = useTasks({ projectId: id });
  const { isAdmin } = useAuth();
  type Tab = (typeof TABS)[number] | 'Finance';
  const [tab, setTab] = useState<Tab>('Overview');
  const tabs: Tab[] = isAdmin
    ? [...TABS.slice(0, 4), 'Finance', ...TABS.slice(4)]
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

      {tab === 'Proposals' && id ? (
        <ProjectProposalsTab projectId={id} clientId={project.client_id} />
      ) : null}

      {tab === 'Documents' || tab === 'Closeout' || tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} bölməsi v1.5-də.
        </div>
      ) : null}
    </>
  );
}

function ProjectProposalsTab({
  projectId,
  clientId,
}: {
  projectId: string;
  clientId: string | null;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const proposals = useQuery({
    queryKey: ['project-proposals', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, title, created_at, share_token, external_link, source')
        .eq('project_id', projectId)
        .eq('category', 'price_protocol')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">Qiymət protokolu</h3>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Təklif
        </button>
      </div>

      {proposals.isLoading ? (
        <p className="text-meta">Yüklənir…</p>
      ) : !proposals.data?.length ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Bu layihə üçün qiymət protokolu yoxdur.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {proposals.data.map((doc) => (
            <li key={doc.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-body">{doc.title}</div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {new Date(doc.created_at).toLocaleDateString('az-AZ')}
                  {doc.share_token ? ' · public link' : ''}
                </div>
              </div>
              {doc.external_link ? (
                <a
                  href={doc.external_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip"
                >
                  Aç
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <ProposalCreateModal
          projectId={projectId}
          clientId={clientId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
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
