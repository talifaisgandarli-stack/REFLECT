/**
 * REQ-PROJ-02 — expertise timeline banner with design_deadline formula.
 * REQ-PROJ-03 — tabs: Overview / Tasks / Documents / Finance (admin) / Closeout / History.
 * REQ-PROJ-04 — closeout checklist; "Layihəni Tamamla" sets status='closed'.
 * REQ-PROJ-05 — award/portfolio submission (referenced from Closeout tab).
 */
import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { useProject, useTasks, useActivityFeed } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';

const TABS_BASE = ['Overview', 'Tasks', 'Documents', 'Closeout', 'History'] as const;
type Tab = (typeof TABS_BASE)[number] | 'Finance';

// REQ-PROJ-02: design_deadline = expertise_deadline − 10 − 30 − 10 − 3 (calendar days)
function calcDesignDeadline(expertiseDeadline: string, bufferDays: number): Date {
  const d = new Date(expertiseDeadline);
  d.setDate(d.getDate() - bufferDays - 30 - 10 - 3);
  return d;
}
function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

// Closeout checklist items (REQ-PROJ-04)
const CLOSEOUT_ITEMS = [
  'Akt imzalanıb',
  'Final sənədlər təhvil verilib',
  'Arxiv hazırlanıb',
  'Portfel üçün fotoşəkillər əlavə edilib',
  'Retrospektiv sorğu göndərilib',
] as const;

export function ProjectDetailPage() {
  const { id } = useParams();
  const { data: project } = useProject(id);
  const { data: tasks = [] } = useTasks({ projectId: id });
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const tabs: Tab[] = isAdmin
    ? ['Overview', 'Tasks', 'Documents', 'Finance', 'Closeout', 'History']
    : ['Overview', 'Tasks', 'Documents', 'Closeout', 'History'];
  const [tab, setTab] = useState<Tab>('Overview');

  // Documents (project_documents table — REQ-PROJ-03)
  const { data: documents = [] } = useQuery({
    queryKey: ['project-documents', id],
    enabled: !!id && tab === 'Documents',
    queryFn: async () => {
      const { data } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', id!)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  // History from activity_log (REQ-PROJ-03)
  const { data: history = [] } = useQuery({
    queryKey: ['project-history', id],
    enabled: !!id && tab === 'History',
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*, profiles!activity_log_user_id_fkey(full_name)')
        .eq('entity_id', id!)
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Closeout checklist state
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allChecked = CLOSEOUT_ITEMS.every((item) => checked.has(item));

  const closeProject = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { error } = await supabase
        .from('projects')
        .update({ status: 'closed' })
        .eq('id', id);
      if (error) throw error;
      // Create portfolio_workflows row (REQ-PROJ-04)
      await supabase.from('portfolio_workflows').insert({ project_id: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  if (!project) {
    return (
      <div className="card text-meta">
        Layihə tapılmadı. <Link to="/layihelər">geri</Link>
      </div>
    );
  }

  // REQ-PROJ-02 expertise banner
  let expertiseBanner: React.ReactNode = null;
  if (project.requires_expertise && project.expertise_deadline) {
    const designDeadline = calcDesignDeadline(
      project.expertise_deadline,
      project.payment_buffer_days ?? 10,
    );
    const daysLeft = daysUntil(designDeadline);
    const ddStr = designDeadline.toLocaleDateString('az-AZ');
    const bannerColor = daysLeft < 14 ? '#B91C1C' : daysLeft < 30 ? '#D97706' : '#16A34A';
    expertiseBanner = (
      <div
        className="rounded-card px-4 py-3 mb-5 text-body"
        style={{ background: `${bannerColor}18`, border: `1px solid ${bannerColor}40`, color: bannerColor }}
      >
        <strong>Ekspertiza layihəsi:</strong> Daxili dizayn deadline:{' '}
        <strong>{ddStr}</strong>
        {daysLeft < 14 ? ` — ${daysLeft} gün qaldı! ⚠` : ` (${daysLeft} gün)`}
        <div className="text-meta mt-1 flex flex-wrap gap-2" style={{ color: 'inherit', opacity: 0.75 }}>
          <span>Ekspertiza: {project.expertise_deadline}</span>
          <span>−{project.payment_buffer_days ?? 10}g ödəniş</span>
          <span>−30g gözləmə</span>
          <span>−10g düzəliş</span>
          <span>−3g çap = <strong>{ddStr}</strong></span>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead
        meta={(project.phases ?? []).join(' → ') || '—'}
        title={project.name}
        actions={
          <button
            className="btn-primary"
            onClick={() => setTab('Documents')}
          >
            + Sənəd əlavə et
          </button>
        }
      />

      {expertiseBanner}

      <nav className="flex gap-2 mb-6 border-b" style={{ borderColor: 'var(--line-soft)' }}>
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
            {t === 'Overview' ? 'İcmal'
              : t === 'Tasks' ? 'Tapşırıqlar'
              : t === 'Documents' ? 'Sənədlər'
              : t === 'Finance' ? 'Maliyyə'
              : t === 'Closeout' ? 'Bağlama'
              : 'Tarixçə'}
          </button>
        ))}
      </nav>

      {/* OVERVIEW */}
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
                      className="w-2 h-2 rounded-full shrink-0"
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
              {project.requires_expertise && project.expertise_deadline ? (
                <Row k="Eksp. deadline" v={project.expertise_deadline} />
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}

      {/* TASKS */}
      {tab === 'Tasks' ? (
        <div className="card">
          {tasks.length === 0 ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Bu layihədə tapşırıq yoxdur.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
              {tasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between">
                  <span className="text-body">{t.title}</span>
                  <StatusChip status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* DOCUMENTS — REQ-PROJ-03, project_documents table */}
      {tab === 'Documents' ? (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-h3">Sənədlər</h3>
            <AddDocumentButton projectId={id!} onAdded={() => qc.invalidateQueries({ queryKey: ['project-documents', id] })} />
          </div>
          {documents.length === 0 ? (
            <div className="text-meta text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Hələ sənəd yoxdur. İlk sənədi əlavə edin.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
              {documents.map((d: {
                id: string; title: string; category: string | null;
                source: string; external_link: string | null; created_at: string;
              }) => (
                <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-body font-medium truncate">{d.title}</div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {d.category ?? '—'} · {d.source}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.external_link ? (
                      <a
                        href={d.external_link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="chip"
                        style={{ color: 'var(--brand-text)' }}
                      >
                        Aç →
                      </a>
                    ) : null}
                    <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {relativeTime(d.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* FINANCE (admin only) */}
      {tab === 'Finance' && id ? <ProjectPnL projectId={id} /> : null}

      {/* CLOSEOUT — REQ-PROJ-04 */}
      {tab === 'Closeout' ? (
        <div className="card max-w-lg">
          <h3 className="text-h3 mb-4">Layihəni bağla</h3>
          {project.status === 'closed' ? (
            <div
              className="rounded-card px-4 py-3"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#16A34A' }}
            >
              Bu layihə artıq bağlanıb.
            </div>
          ) : (
            <>
              <ul className="space-y-2 mb-6">
                {CLOSEOUT_ITEMS.map((item) => (
                  <li key={item}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked.has(item)}
                        onChange={(e) => {
                          const next = new Set(checked);
                          if (e.target.checked) next.add(item);
                          else next.delete(item);
                          setChecked(next);
                        }}
                      />
                      <span className="text-body" style={{ color: checked.has(item) ? 'var(--text-muted)' : 'var(--text)', textDecoration: checked.has(item) ? 'line-through' : 'none' }}>
                        {item}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {closeProject.error ? (
                <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>
                  {(closeProject.error as Error).message}
                </p>
              ) : null}
              <button
                className="btn-primary w-full"
                disabled={!allChecked || closeProject.isPending}
                onClick={() => closeProject.mutate()}
              >
                {closeProject.isPending ? 'Bağlanır…' : 'Layihəni Tamamla'}
              </button>
              {!allChecked ? (
                <p className="text-meta mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
                  Bütün məntəqələri işarələyin
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* HISTORY — REQ-PROJ-03 */}
      {tab === 'History' ? (
        <div className="card">
          <h3 className="text-h3 mb-4">Tarixçə</h3>
          {history.length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Hələ aktivlik yoxdur.
            </div>
          ) : (
            <ul className="space-y-3">
              {history.map((entry: {
                id: string; action: string; field_name: string | null;
                old_value: unknown; new_value: unknown; created_at: string;
                profiles?: { full_name: string | null } | null;
              }) => (
                <li key={entry.id} className="flex items-start gap-3">
                  <Avatar name={entry.profiles?.full_name ?? 'Sistem'} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-body">
                      <span className="font-medium">
                        {entry.profiles?.full_name ?? 'Sistem'}
                      </span>{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        {entry.action}
                        {entry.field_name ? ` (${entry.field_name})` : ''}
                        {entry.old_value != null && entry.new_value != null
                          ? `: ${String(entry.old_value)} → ${String(entry.new_value)}`
                          : ''}
                      </span>
                    </div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {relativeTime(entry.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}

// Inline document add button / mini form
function AddDocumentButton({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState('');

  const add = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const { error } = await supabase.from('project_documents').insert({
        project_id: projectId,
        title: title.trim(),
        external_link: link.trim() || null,
        category: category.trim() || null,
        source: link.trim() ? 'drive_link' : 'upload',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setLink('');
      setCategory('');
      onAdded();
    },
  });

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Sənəd
      </button>
    );
  }
  return (
    <form
      className="flex gap-2 items-end flex-wrap"
      onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
    >
      <input
        className="input max-w-[160px]"
        placeholder="Başlıq"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        autoFocus
      />
      <input
        className="input max-w-[200px]"
        placeholder="Link (Drive/Dropbox)"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <input
        className="input max-w-[120px]"
        placeholder="Kateqoriya"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={add.isPending}>
        {add.isPending ? '…' : 'Əlavə et'}
      </button>
      <button type="button" className="btn-outline" onClick={() => setOpen(false)}>
        Ləğv
      </button>
    </form>
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
