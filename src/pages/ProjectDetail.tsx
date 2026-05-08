import { useParams, Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { useCreateRetrospective, useProject, useTasks } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';

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

      {tab === 'Closeout' ? <CloseoutPanel projectId={project.id} isAdmin={isAdmin} /> : null}

      {tab === 'Documents' || tab === 'Finance' || tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} bölməsi v1.5-də.
        </div>
      ) : null}
    </>
  );
}

function CloseoutPanel({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const create = useCreateRetrospective();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isAdmin) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Closeout proseduru admin tərəfindən aparılır.
      </div>
    );
  }

  function generate() {
    create.mutate(projectId, {
      onSuccess: (row) => {
        setLink(`${window.location.origin}/r/${row.share_token}`);
        setCopied(false);
      },
    });
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="card">
      <h3 className="text-h3 mb-2">Müştəri rəyi sorğusu</h3>
      <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
        Sorğu yarat, link müştəriyə göndər. Cavab gəldikdə avtomatik qeyd olunacaq.
      </p>
      <button
        className="btn-primary"
        disabled={create.isPending}
        onClick={generate}
      >
        {create.isPending ? 'Yaradılır…' : 'Sorğu yarat'}
      </button>
      {link ? (
        <div
          className="mt-4 rounded-card p-3"
          style={{ background: 'var(--surface-mist)' }}
        >
          <div
            className="text-tiny uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Paylaşım linki
          </div>
          <div className="flex gap-2">
            <input className="input flex-1" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
            <button className="btn-outline" onClick={copy}>
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>
      ) : null}
      {create.isError ? (
        <div className="text-meta mt-3" style={{ color: 'var(--danger, #B91C1C)' }}>
          {(create.error as Error).message}
        </div>
      ) : null}
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
