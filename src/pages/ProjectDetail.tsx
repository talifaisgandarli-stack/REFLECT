import { useParams, Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import {
  DEFAULT_CLOSEOUT_ITEMS,
  DOCUMENT_CATEGORIES,
  useCloseProject,
  useCloseoutChecklist,
  useCreateProjectDocument,
  useCreateRetrospective,
  useDeleteProjectDocument,
  useProject,
  useProjectDocuments,
  useReopenProject,
  useTasks,
} from '@/lib/hooks';
import type { CloseoutItem } from '@/types/db';
import { useEffect } from 'react';
import { PortfolioPanel } from '@/components/PortfolioPanel';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';

const TABS = ['Overview', 'Tasks', 'Documents', 'Closeout', 'Portfolio', 'History'] as const;

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

      {tab === 'Closeout' ? (
        <CloseoutPanel
          projectId={project.id}
          isAdmin={isAdmin}
          status={project.status}
          taskCount={tasks.length}
        />
      ) : null}

      {tab === 'Portfolio' ? (
        <PortfolioPanel
          projectId={project.id}
          isAdmin={isAdmin}
          status={project.status}
        />
      ) : null}

      {tab === 'Documents' ? (
        <DocumentsPanel projectId={project.id} clientId={project.client_id} isAdmin={isAdmin} />
      ) : null}

      {tab === 'Finance' || tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} bölməsi v1.5-də.
        </div>
      ) : null}
    </>
  );
}

function DocumentsPanel({
  projectId,
  clientId,
  isAdmin,
}: {
  projectId: string;
  clientId: string | null;
  isAdmin: boolean;
}) {
  const { data: docs = [], isLoading } = useProjectDocuments(projectId);
  const create = useCreateProjectDocument();
  const del = useDeleteProjectDocument();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!title.trim()) return setErr('Başlıq lazımdır.');
    if (!link.trim()) return setErr('Link lazımdır.');
    create.mutate(
      {
        project_id: projectId,
        client_id: clientId,
        category,
        title: title.trim(),
        source: 'drive_link',
        external_link: link.trim(),
      },
      {
        onSuccess: () => {
          setAdding(false);
          setTitle('');
          setLink('');
        },
        onError: (e) => setErr((e as Error).message),
      },
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">Sənədlər</h3>
        {isAdmin && !adding ? (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + Link əlavə et
          </button>
        ) : null}
      </div>

      {adding ? (
        <div
          className="rounded-card p-3 mb-3"
          style={{ background: 'var(--surface-mist)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
            <input
              className="input"
              placeholder="Başlıq"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="https://drive.google.com/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          {err ? (
            <div className="text-meta mb-2" style={{ color: 'var(--danger, #B91C1C)' }}>
              {err}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={() => setAdding(false)}>
              Ləğv et
            </button>
            <button className="btn-primary" disabled={create.isPending} onClick={submit}>
              {create.isPending ? 'Yazılır…' : 'Əlavə et'}
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-meta">Yüklənir…</div>
      ) : docs.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Sənəd yoxdur.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {docs.map((d) => (
            <li
              key={d.id}
              className="py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium truncate">{d.title}</div>
                <div
                  className="text-meta truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {d.category ?? '—'} ·{' '}
                  {d.source === 'drive_link'
                    ? 'Link'
                    : d.source === 'auto_generated'
                      ? 'Avto'
                      : 'Yüklənmiş'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.external_link ? (
                  <a
                    className="btn-outline"
                    href={d.external_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Aç
                  </a>
                ) : null}
                {isAdmin ? (
                  <button
                    className="btn-outline"
                    style={{ color: 'var(--danger, #B91C1C)' }}
                    onClick={() => {
                      if (!confirm('Sənədi silmək istəyirsən?')) return;
                      del.mutate({ id: d.id, projectId });
                    }}
                  >
                    Sil
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CloseoutPanel({
  projectId,
  isAdmin,
  status,
  taskCount,
}: {
  projectId: string;
  isAdmin: boolean;
  status: string;
  taskCount: number;
}) {
  const survey = useCreateRetrospective();
  const close = useCloseProject();
  const reopen = useReopenProject();
  const { data: existing } = useCloseoutChecklist(projectId);

  const [items, setItems] = useState<CloseoutItem[]>(DEFAULT_CLOSEOUT_ITEMS);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);

  useEffect(() => {
    if (existing?.items?.length) setItems(existing.items);
  }, [existing]);

  if (!isAdmin) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Closeout proseduru admin tərəfindən aparılır.
      </div>
    );
  }

  const allChecked = items.every((i) => i.checked);
  const isClosed = status === 'closed';

  function toggle(idx: number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it)));
  }

  function finalize() {
    setCloseErr(null);
    close.mutate(
      { projectId, items },
      {
        onError: (e) => {
          const msg = (e as Error).message;
          if (msg.includes('items_unchecked')) setCloseErr('Bütün maddələr işarələnməlidir.');
          else if (msg.includes('admin_only')) setCloseErr('Yalnız admin layihəni bağlaya bilər.');
          else setCloseErr(msg);
        },
      },
    );
  }

  function generateSurvey() {
    survey.mutate(projectId, {
      onSuccess: (row) => {
        setLink(`${window.location.origin}/r/${row.share_token}`);
        setCopied(false);
      },
    });
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card">
        <h3 className="text-h3 mb-2">Closeout siyahısı</h3>
        {taskCount === 0 ? (
          <div
            className="text-meta mb-3 rounded-card p-2"
            style={{ background: 'var(--surface-mist)', color: 'var(--text-muted)' }}
          >
            Diqqət: bu layihədə tapşırıq yoxdur — bağlanmasına icazə verilir, lakin
            tarixçə boş qalacaq.
          </div>
        ) : null}
        {isClosed ? (
          <div
            className="mb-3 rounded-card p-3 flex items-center justify-between gap-3"
            style={{ background: 'var(--surface-mist)' }}
          >
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Layihə bağlanıb. Səhv olduğu halda admin yenidən aça bilər.
            </span>
            <button
              className="btn-outline"
              disabled={reopen.isPending}
              onClick={() => {
                if (!confirm('Layihəni yenidən açmaq istəyirsən?')) return;
                reopen.mutate(projectId);
              }}
            >
              {reopen.isPending ? 'Açılır…' : 'Yenidən aç'}
            </button>
          </div>
        ) : null}
        <ul className="space-y-2 mb-4">
          {items.map((it, i) => (
            <li key={it.key}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={it.checked}
                  disabled={isClosed}
                  onChange={() => toggle(i)}
                />
                <span
                  className="text-body"
                  style={{
                    textDecoration: it.checked ? 'line-through' : 'none',
                    color: it.checked ? 'var(--text-muted)' : 'var(--text)',
                  }}
                >
                  {it.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {closeErr ? (
          <div className="text-meta mb-2" style={{ color: 'var(--danger, #B91C1C)' }}>
            {closeErr}
          </div>
        ) : null}
        <button
          className="btn-primary"
          disabled={!allChecked || isClosed || close.isPending}
          onClick={finalize}
        >
          {close.isPending
            ? 'Bağlanır…'
            : isClosed
              ? 'Bağlanıb'
              : 'Layihəni Tamamla'}
        </button>
      </div>

      <div className="card">
        <h3 className="text-h3 mb-2">Müştəri rəyi sorğusu</h3>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          Sorğu yarat, linki müştəriyə göndər. Cavab gəldikdə avtomatik qeyd olunacaq.
        </p>
        <button
          className="btn-primary"
          disabled={survey.isPending}
          onClick={generateSurvey}
        >
          {survey.isPending ? 'Yaradılır…' : 'Sorğu yarat'}
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
              <input
                className="input flex-1"
                value={link}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="btn-outline" onClick={copyLink}>
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          </div>
        ) : null}
        {survey.isError ? (
          <div className="text-meta mt-3" style={{ color: 'var(--danger, #B91C1C)' }}>
            {(survey.error as Error).message}
          </div>
        ) : null}
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
