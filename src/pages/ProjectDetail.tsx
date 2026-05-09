import { useParams, Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import {
  useProject,
  useTasks,
  useCompleteProject,
  usePortfolioWorkflow,
} from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';

const TABS = ['Overview', 'Tasks', 'Documents', 'Closeout', 'History'] as const;

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

      {tab === 'Closeout' && id ? (
        <CloseoutTab
          projectId={id}
          status={project.status}
          isAdmin={isAdmin}
        />
      ) : null}

      {tab === 'Documents' || tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} bölməsi v1.5-də.
        </div>
      ) : null}
    </>
  );
}

const CHECKLIST = [
  { key: 'akt', label: 'Akt imzalandı' },
  { key: 'docs', label: 'Final sənədlər təhvil verildi' },
  { key: 'archive', label: 'Layihə arxivə köçürüldü' },
  { key: 'portfolio', label: 'Portfel materialları hazırdır' },
  { key: 'survey', label: 'Retrospektiv sorğu göndərildi' },
] as const;

function CloseoutTab({
  projectId,
  status,
  isAdmin,
}: {
  projectId: string;
  status: string;
  isAdmin: boolean;
}) {
  // REQ-PROJ-04: 5-item checklist, ephemeral until "Layihəni Tamamla" fires.
  // PRD does not define a persisted closeout-checklist column, so progress is
  // session-local; the portfolio_workflows row is created on completion.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = CHECKLIST.every((i) => checked[i.key]);
  const closed = status === 'closed';
  const complete = useCompleteProject();
  const portfolio = usePortfolioWorkflow(projectId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card lg:col-span-2">
        <h3 className="text-h3 mb-3">Bağlanış sənədləri</h3>
        <ul className="space-y-2">
          {CHECKLIST.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              <input
                id={`cl-${item.key}`}
                type="checkbox"
                checked={!!checked[item.key] || closed}
                disabled={closed || !isAdmin}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.key]: e.target.checked }))
                }
              />
              <label htmlFor={`cl-${item.key}`} className="text-body">
                {item.label}
              </label>
            </li>
          ))}
        </ul>
        {complete.isError ? (
          <div className="text-meta mt-3" style={{ color: 'var(--danger, #c33)' }}>
            {(complete.error as Error)?.message ?? 'Xəta baş verdi'}
          </div>
        ) : null}
      </div>
      <div className="card">
        <h3 className="text-h3 mb-3">Status</h3>
        {closed ? (
          <>
            <p className="text-body" style={{ color: 'var(--brand-text)' }}>
              ✓ Layihə bağlanıb
            </p>
            <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
              {portfolio.data
                ? 'Portfel iş axını yaradılıb.'
                : 'Portfel iş axını hələ yaradılmayıb.'}
            </p>
          </>
        ) : (
          <>
            <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
              Bütün maddələri yoxla → "Layihəni Tamamla".
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!isAdmin || !allChecked || complete.isPending}
              onClick={() => complete.mutate(projectId)}
            >
              {complete.isPending ? 'Bağlanır…' : 'Layihəni Tamamla'}
            </button>
          </>
        )}
      </div>
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
