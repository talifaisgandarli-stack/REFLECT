/**
 * REQ-PROJ-02 — expertise timeline banner with design_deadline formula.
 * REQ-PROJ-03 — tabs: Overview / Tasks / Documents / Finance (admin) / Closeout / History.
 * REQ-PROJ-04 — closeout checklist; "Layihəni Tamamla" sets status='closed'.
 * REQ-PROJ-05 — award/portfolio submission (referenced from Closeout tab).
 */
import { useParams, Link } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { trackRecentEntry } from '@/lib/useRecentlyViewed';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { useProject, useTasks, useActivityFeed } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';
import { TaskCreateModal } from '@/components/TaskCreateModal';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';
import { fileSizeError } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatDuration, useTaskTimeTotals } from '@/lib/useTimeTracking';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER } from '@/lib/labels';
import type { TaskStatus } from '@/types/db';

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

// Closeout checklist defaults (REQ-PROJ-04). Per-project custom items are
// stored in closeout_checklists.custom_items (migration 0039) and merged at
// render time.
const CLOSEOUT_DEFAULTS = [
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

  // PRD §UX — log this project visit for the Dashboard "Recently viewed" widget
  useEffect(() => {
    if (project?.id && project.name) {
      trackRecentEntry({
        type: 'project',
        id: project.id,
        title: project.name,
        href: `/layihelər/${project.id}`,
      });
    }
  }, [project?.id, project?.name]);

  const tabs: Tab[] = isAdmin
    ? ['Overview', 'Tasks', 'Documents', 'Finance', 'Closeout', 'History']
    : ['Overview', 'Tasks', 'Documents', 'Closeout', 'History'];
  const [tab, setTab] = useState<Tab>('Overview');
  const [addingTask, setAddingTask] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatus | 'all'>('all');

  const filteredTasks = useMemo(() => {
    if (taskStatusFilter === 'all') return tasks;
    return tasks.filter((t) => t.status === taskStatusFilter);
  }, [tasks, taskStatusFilter]);

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

  // History from activity_log — REQ-PROJ-03. Show project events PLUS task
  // events that belong to this project, so the history tab isn't deceptively
  // empty when only tasks have moved.
  const { data: history = [] } = useQuery({
    queryKey: ['project-history', id],
    enabled: !!id && tab === 'History',
    queryFn: async () => {
      const projectTaskIds = await supabase
        .from('tasks')
        .select('id')
        .eq('project_id', id!)
        .limit(500);
      const taskIds = (projectTaskIds.data ?? []).map((t: { id: string }) => t.id);
      const ids = [id!, ...taskIds];
      const { data } = await supabase
        .from('activity_log')
        .select('*, profiles!activity_log_user_id_fkey(full_name)')
        .in('entity_id', ids)
        .order('created_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  // Closeout checklist — persisted to closeout_checklists.items (jsonb array of
  // ticked labels). Anyone with project access can tick boxes (RLS scoped).
  const closeoutQ = useQuery({
    queryKey: ['closeout', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('closeout_checklists')
        .select('items, custom_items, completed_at')
        .eq('project_id', id!)
        .maybeSingle();
      return data ?? { items: [] as string[], custom_items: [] as string[], completed_at: null };
    },
  });
  const checked = new Set<string>(((closeoutQ.data?.items as string[]) ?? []));
  // Memoize customItems by its underlying data ref so the merged useMemo below
  // doesn't recompute on every render (was triggering an eslint warning).
  const customItems = useMemo<string[]>(
    () => (closeoutQ.data?.custom_items as string[]) ?? [],
    [closeoutQ.data?.custom_items],
  );
  // Merged list = defaults + per-project custom items (de-duplicated)
  const allItems = useMemo(
    () => Array.from(new Set([...CLOSEOUT_DEFAULTS, ...customItems])),
    [customItems],
  );
  const allChecked = allItems.every((item) => checked.has(item));

  // Local UI state for adding custom items
  const [newItemDraft, setNewItemDraft] = useState('');

  const addCustomItem = useMutation({
    mutationFn: async (label: string) => {
      if (!id) return;
      const trimmed = label.trim();
      if (!trimmed) throw new Error('Maddə boş ola bilməz');
      if (allItems.includes(trimmed)) throw new Error('Bu maddə artıq mövcuddur');
      const nextCustom = [...customItems, trimmed];
      const { error } = await supabase
        .from('closeout_checklists')
        .upsert(
          { project_id: id, items: Array.from(checked), custom_items: nextCustom },
          { onConflict: 'project_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      setNewItemDraft('');
      qc.invalidateQueries({ queryKey: ['closeout', id] });
    },
  });

  const removeCustomItem = useMutation({
    mutationFn: async (label: string) => {
      if (!id) return;
      const nextCustom = customItems.filter((i) => i !== label);
      const nextChecked = Array.from(checked).filter((i) => i !== label);
      const { error } = await supabase
        .from('closeout_checklists')
        .upsert(
          { project_id: id, items: nextChecked, custom_items: nextCustom },
          { onConflict: 'project_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closeout', id] }),
  });

  const toggleCloseout = useMutation({
    mutationFn: async (next: string[]) => {
      if (!id) return;
      const { error } = await supabase
        .from('closeout_checklists')
        .upsert({ project_id: id, items: next }, { onConflict: 'project_id' });
      if (error) throw error;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['closeout', id] });
      const prev = qc.getQueryData(['closeout', id]);
      qc.setQueryData(['closeout', id], { items: next, completed_at: null });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['closeout', id], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['closeout', id] }),
  });

  // Admin toggles a phase on/off — phases is text[] in schema.
  const togglePhase = useMutation({
    mutationFn: async (phase: string) => {
      if (!id || !project) return;
      const current = project.phases ?? [];
      const next = current.includes(phase)
        ? current.filter((p) => p !== phase)
        : [...current, phase];
      const { error } = await supabase.from('projects').update({ phases: next }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const closeProject = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { error } = await supabase
        .from('projects')
        .update({ status: 'closed' })
        .eq('id', id);
      if (error) throw error;
      // Mark checklist as completed (audit trail)
      await supabase
        .from('closeout_checklists')
        .upsert(
          { project_id: id, items: Array.from(checked), completed_at: new Date().toISOString() },
          { onConflict: 'project_id' },
        );
      // Create portfolio_workflows row (REQ-PROJ-04)
      await supabase.from('portfolio_workflows').insert({ project_id: id });
      // PRD §REQ-PROJ-04 — auto-create 4 portfolio prep tasks so the team has a
      // working checklist in the Tasks module without manual setup. Each task
      // carries the 'portfolio' label so the Tasks page can filter to them.
      const portfolioPrep = [
        { title: 'Foto/render çək (portfolio üçün)' },
        { title: 'Case study mətnini yaz (portfolio)' },
        { title: 'Website / Behance səhifəsini yenilə (portfolio)' },
        { title: 'Mükafat seç və müraciəti hazırla (portfolio)' },
      ];
      const { data: sess } = await supabase.auth.getSession();
      const creator = sess.session?.user?.id ?? null;
      await supabase.from('tasks').insert(
        portfolioPrep.map((p) => ({
          title: p.title,
          status: 'queued',
          project_id: id,
          labels: ['portfolio'],
          created_by: creator,
        })),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['closeout', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
    const bannerColor  = daysLeft < 14 ? 'var(--error-deep)'    : daysLeft < 30 ? 'var(--warning)'      : 'var(--success-deep)';
    const bannerBg     = daysLeft < 14 ? 'var(--error-bg)'      : daysLeft < 30 ? 'var(--warning-bg)'    : 'var(--success-bg)';
    const bannerBorder = daysLeft < 14 ? 'var(--error-border)'  : daysLeft < 30 ? 'var(--warning-border)': 'var(--success-border)';
    expertiseBanner = (
      <div
        className="rounded-card px-4 py-3 mb-5 text-body"
        style={{ background: bannerBg, border: `1px solid ${bannerBorder}`, color: bannerColor }}
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
          <>
            {/* PRD §UX — copy current URL so admins can paste into Slack/Telegram */}
            <CopyUrlButton />
            <button
              className="btn-primary"
              onClick={() => setTab('Documents')}
            >
              + Sənəd əlavə et
            </button>
          </>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-h3">Mərhələlər</h3>
              {isAdmin ? (
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  Klik et — keç/söndür
                </span>
              ) : null}
            </div>

            {/* PRD §REQ-PROJ — phase progress bar (active / total) */}
            {(() => {
              const active = (project.phases ?? []).length;
              const total = PROJECT_PHASES.length;
              const pct = total > 0 ? Math.round((active / total) * 100) : 0;
              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-meta mb-1">
                    <span style={{ color: 'var(--text-muted)' }}>İrəliləyiş</span>
                    <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {active} / {total} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--line)', borderRadius: 999 }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--brand-action)',
                        borderRadius: 999,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            <ol className="space-y-2">
              {PROJECT_PHASES.map((p) => {
                const active = project.phases?.includes(p);
                return (
                  <li key={p}>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="flex items-center gap-3 w-full text-left rounded-btn px-1 py-0.5 hover:bg-surface-mist"
                        onClick={() => togglePhase.mutate(p)}
                        disabled={togglePhase.isPending}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: active ? 'var(--brand-action)' : 'var(--line)' }}
                        />
                        <span style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{p}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: active ? 'var(--brand-action)' : 'var(--line)' }}
                        />
                        <span style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{p}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card">
            <h3 className="text-h3 mb-3">Əsas məlumat</h3>
            <dl className="text-body space-y-2">
              {/* PRD §UX — inline name edit (admin) */}
              {isAdmin ? (
                <ProjectNameEditor projectId={id!} initial={project.name} />
              ) : (
                <Row k="Ad" v={project.name} />
              )}
              {/* PRD §6.x — tag chips with × (admin) (migration 0053) */}
              <ProjectTagsEditor projectId={id!} initial={(project as { tags?: string[] }).tags ?? []} isAdmin={isAdmin} />
              {/* PRD §6.x — project description (migration 0054) */}
              <ProjectDescriptionEditor projectId={id!} initial={(project as { description?: string | null }).description ?? null} isAdmin={isAdmin} />
              {isAdmin ? (
                <ProjectStatusEditor projectId={id!} initial={project.status} />
              ) : (
                <Row k="Status" v={project.status} />
              )}
              {isAdmin ? (
                <ProjectDateField projectId={id!} field="start_date" label="Başlama" initial={project.start_date} />
              ) : (
                <Row k="Başlama" v={project.start_date ?? '—'} />
              )}
              {/* PRD §UX — inline deadline edit (admin) */}
              {isAdmin ? (
                <ProjectDateField projectId={id!} field="deadline" label="Deadline" initial={project.deadline} />
              ) : (
                <Row k="Deadline" v={project.deadline ?? '—'} />
              )}
              <ProjectTimeTotal taskIds={tasks.map((t) => t.id)} />
              <ProjectClientLink projectId={id!} clientId={project.client_id} isAdmin={isAdmin} />
              {isAdmin ? (
                <ProjectExpertiseToggle projectId={id!} initial={project.requires_expertise} />
              ) : (
                <Row k="Ekspertiza" v={project.requires_expertise ? 'Lazımdır' : 'Yox'} />
              )}
              {project.requires_expertise ? (
                isAdmin ? (
                  <ProjectDateField
                    projectId={id!}
                    field="expertise_deadline"
                    label="Eksp. deadline"
                    initial={project.expertise_deadline}
                  />
                ) : (
                  project.expertise_deadline ? (
                    <Row k="Eksp. deadline" v={project.expertise_deadline} />
                  ) : null
                )
              ) : null}
              {/* PRD §REQ-PROJ-01 — payment buffer days (default 10) */}
              {isAdmin ? (
                <ProjectPaymentBufferEditor projectId={id!} initial={project.payment_buffer_days ?? 10} />
              ) : (
                <Row k="Ödəniş gecikməsi" v={`${project.payment_buffer_days ?? 10} gün`} />
              )}
              {/* PRD §REQ-FIN-06 — admin can edit project budget inline */}
              {isAdmin ? (
                <ProjectBudgetEditor projectId={id!} initialBudget={(project as { budget_amount?: number | null }).budget_amount ?? null} />
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}

      {/* TASKS */}
      {tab === 'Tasks' ? (
        <div className="card">
          {/* PRD §REQ-PROJ — burndown summary: open vs done over time */}
          {tasks.length >= 3 ? <TaskBurndown tasks={tasks} /> : null}

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <select
              className="input"
              style={{ maxWidth: 200 }}
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value as TaskStatus | 'all')}
              aria-label="Status filtri"
            >
              <option value="all">Bütün statuslar ({tasks.length})</option>
              {TASK_STATUS_ORDER.map((s) => {
                const count = tasks.filter((t) => t.status === s).length;
                if (!count) return null;
                return (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]} ({count})
                  </option>
                );
              })}
            </select>
            {/* Bulk archive all done tasks (admin only — non-admin RLS rejects) */}
            {isAdmin && tasks.some((t) => t.status === 'done' && !t.archived_at) ? (
              <ArchiveDoneTasksChip projectId={id!} doneCount={tasks.filter((t) => t.status === 'done' && !t.archived_at).length} />
            ) : null}
            <button className="btn-primary" onClick={() => setAddingTask(true)}>
              + Tapşırıq
            </button>
          </div>
          {filteredTasks.length === 0 ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {tasks.length === 0 ? 'Bu layihədə tapşırıq yoxdur.' : 'Bu statusda tapşırıq yoxdur.'}
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
              {filteredTasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <span className="text-body flex-1 min-w-0 truncate">{t.title}</span>
                  {t.deadline ? (
                    <span className="text-meta shrink-0" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {t.deadline}
                    </span>
                  ) : null}
                  <StatusChip status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {addingTask && id ? (
        <TaskCreateModal
          defaultProjectId={id}
          onClose={() => setAddingTask(false)}
        />
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
                source: string; external_link: string | null; storage_path: string | null;
                share_token: string | null; shared_with: string[] | null; created_at: string;
              }) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['project-documents', id] })}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* FINANCE (admin only) */}
      {tab === 'Finance' && id ? <ProjectPnL projectId={id} /> : null}

      {/* CLOSEOUT — REQ-PROJ-04 + REQ-PROJ-05 */}
      {tab === 'Closeout' ? (
        <div className="space-y-4 max-w-lg">
          <div className="card">
            <h3 className="text-h3 mb-4">Layihəni bağla</h3>
            {project.status === 'closed' ? (
              <div className="space-y-3">
                <div
                  className="rounded-card px-4 py-3"
                  style={{ background: 'var(--success-bg)', color: 'var(--success-deep)' }}
                >
                  Bu layihə artıq bağlanıb. ✓
                </div>
                {/* US-PROJ-05 — Reopen closed project (admin only) */}
                {isAdmin ? <ReopenProjectButton projectId={id!} /> : null}
              </div>
            ) : (
              <>
                {/* Closeout progress % — visible at-a-glance signal */}
                {(() => {
                  const totalItems = allItems.length;
                  const checkedCount = allItems.filter((i) => checked.has(i)).length;
                  const pct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
                  return (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          Bağlanış proqresi
                        </span>
                        <span className="text-meta" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {checkedCount} / {totalItems} · {pct}%
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 999 }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: pct === 100 ? 'var(--success-deep)' : 'var(--brand-action)',
                            borderRadius: 999,
                            transition: 'width 0.2s',
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}

                <ul className="space-y-2 mb-4">
                  {allItems.map((item) => {
                    const isCustom = !CLOSEOUT_DEFAULTS.includes(item as typeof CLOSEOUT_DEFAULTS[number]);
                    return (
                      <li key={item} className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked.has(item)}
                            onChange={(e) => {
                              const next = new Set(checked);
                              if (e.target.checked) next.add(item);
                              else next.delete(item);
                              toggleCloseout.mutate(Array.from(next));
                            }}
                          />
                          <span
                            className="text-body truncate"
                            style={{
                              color: checked.has(item) ? 'var(--text-muted)' : 'var(--text)',
                              textDecoration: checked.has(item) ? 'line-through' : 'none',
                            }}
                          >
                            {item}
                            {isCustom ? (
                              <span className="text-meta ml-2" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                xüsusi
                              </span>
                            ) : null}
                          </span>
                        </label>
                        {/* Admin can remove only custom items (not defaults) */}
                        {isAdmin && isCustom ? (
                          <button
                            type="button"
                            className="text-meta shrink-0"
                            style={{ color: 'var(--text-muted)', fontSize: 11 }}
                            onClick={() => removeCustomItem.mutate(item)}
                            title="Bu xüsusi maddəni sil"
                          >
                            ×
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                {/* Admin: add a per-project checklist item (PRD §3.2 jsonb items) */}
                {isAdmin ? (
                  <form
                    className="flex gap-2 mb-4"
                    onSubmit={(e) => { e.preventDefault(); addCustomItem.mutate(newItemDraft); }}
                  >
                    <input
                      className="input flex-1"
                      placeholder="Xüsusi məntəqə əlavə et…"
                      value={newItemDraft}
                      onChange={(e) => setNewItemDraft(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn-outline"
                      disabled={!newItemDraft.trim() || addCustomItem.isPending}
                    >
                      {addCustomItem.isPending ? '…' : '+ Əlavə et'}
                    </button>
                  </form>
                ) : null}
                {addCustomItem.error ? (
                  <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
                    {(addCustomItem.error as Error).message}
                  </p>
                ) : null}
                {closeProject.error ? (
                  <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
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

          {/* Retrospective survey trigger (REQ-CRM-07 / US-CRM-06) */}
          {project.status === 'closed' && project.client_id ? (
            <RetroSurveyTrigger projectId={id!} clientId={project.client_id} />
          ) : null}

          {/* Award submission (REQ-PROJ-05) */}
          {project.status === 'closed' ? <AwardsSection projectId={id!} /> : null}
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

// REQ-PROJ-03 + REQ-CRM-06 — Inline document add: file upload OR external link
function AddDocumentButton({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // PRD §UX — drag-drop file handling. Auto-fills title from filename
  // when the title field is empty (UX nicety).
  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      if (!title.trim()) {
        setTitle(dropped.name.replace(/\.[^.]+$/, ''));
      }
    }
  }

  const add = useMutation({
    mutationFn: async () => {
      setErr(null);
      if (!title.trim()) throw new Error('Başlıq tələb olunur');

      let storagePath: string | null = null;
      // Upload to Supabase Storage when a file is selected
      if (file) {
        const sizeErr = fileSizeError(file, 25);
        if (sizeErr) throw new Error(sizeErr);
        const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
        const path = `${projectId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('project-documents')
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw new Error(`Yükləmə xətası: ${upErr.message}`);
        storagePath = path;
      }

      const source = file ? 'upload' : link.trim() ? 'drive_link' : 'auto_generated';
      const { error } = await supabase.from('project_documents').insert({
        project_id: projectId,
        title: title.trim(),
        external_link: link.trim() || null,
        storage_path: storagePath,
        category: category.trim() || null,
        source,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setLink('');
      setCategory('');
      setFile(null);
      onAdded();
    },
    onError: (e: Error) => setErr(e.message),
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
      className="flex flex-col gap-2 w-full sm:max-w-[640px] rounded-card transition-all"
      style={{
        padding: dragOver ? 12 : 0,
        background: dragOver ? 'var(--brand-glow-sm)' : undefined,
        border: dragOver ? '2px dashed var(--brand-action)' : '2px dashed transparent',
      }}
      onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={handleDrop}
    >
      <div className="flex gap-2 items-end flex-wrap">
        <input
          className="input flex-1 min-w-[160px]"
          placeholder="Başlıq"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
        <input
          className="input max-w-[140px]"
          placeholder="Kateqoriya"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>
      <div className="flex gap-2 items-end flex-wrap">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Link (Drive/Dropbox) — və ya fayl seçin / sürüşdürün ↓"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={!!file}
        />
        <label className="btn-outline cursor-pointer" style={{ whiteSpace: 'nowrap' }}>
          {file ? `📎 ${file.name.slice(0, 24)}…` : '📎 Fayl seç'}
          <input
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file ? (
          <button type="button" className="text-meta" style={{ color: 'var(--text-muted)' }} onClick={() => setFile(null)}>
            ×
          </button>
        ) : null}
      </div>
      <p className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        💡 Faylı buraya sürüşdürə bilərsiz (drag &amp; drop)
      </p>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-outline" onClick={() => { setOpen(false); setErr(null); }}>
          Ləğv
        </button>
        <button type="submit" className="btn-primary" disabled={add.isPending}>
          {add.isPending ? 'Yüklənir…' : 'Əlavə et'}
        </button>
      </div>
      {err ? (
        <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{err}</p>
      ) : null}
    </form>
  );
}

// REQ-PROJ-03 + REQ-CRM-06 — single document row with download + share-link
// Plus REQ-CRM-06 shared_with[] granular team-member sharing
function DocumentRow({
  doc,
  onChanged,
}: {
  doc: {
    id: string;
    title: string;
    category: string | null;
    source: string;
    external_link: string | null;
    storage_path: string | null;
    share_token: string | null;
    shared_with: string[] | null;
    created_at: string;
  };
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState<'share' | 'download' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Lazy-load profiles only when the share popover is opened
  const profiles = useQuery({
    queryKey: ['profiles', 'doc-share'],
    enabled: shareOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string }>;
    },
  });

  async function downloadStorage() {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function previewStorage() {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(doc.storage_path, 300); // 5 min for in-modal preview
    if (error || !data?.signedUrl) return;
    setPreviewUrl(data.signedUrl);
  }

  async function copyPublicLink() {
    let token = doc.share_token;
    if (!token) {
      // Generate URL-safe token + persist
      token = crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabase
        .from('project_documents')
        .update({ share_token: token })
        .eq('id', doc.id);
      if (error) return;
      onChanged();
    }
    const url = `${window.location.origin}/docs/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('share');
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt('Linki kopyalayın:', url);
    }
  }

  async function toggleSharedUser(userId: string) {
    const current = doc.shared_with ?? [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    const { error } = await supabase
      .from('project_documents')
      .update({ shared_with: next })
      .eq('id', doc.id);
    if (!error) onChanged();
  }

  const sharedCount = (doc.shared_with ?? []).length;

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          {/* PRD §UX — file icon by extension */}
          <span style={{ fontSize: 22 }} aria-hidden>
            {(() => {
              const ext = (doc.storage_path?.split('.').pop() ?? '').toLowerCase();
              if (['pdf'].includes(ext)) return '📕';
              if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
              if (['docx', 'doc'].includes(ext)) return '📄';
              if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return '🖼';
              if (['zip', 'rar', '7z'].includes(ext)) return '🗜';
              if (['dwg', 'dxf'].includes(ext)) return '📐';
              if (doc.external_link) return '🔗';
              return '📁';
            })()}
          </span>
          <div className="min-w-0">
            <div className="text-body font-medium truncate">{doc.title}</div>
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {doc.category ?? '—'} · {doc.source}
              {doc.share_token ? ' · publik link' : ''}
              {sharedCount > 0 ? ` · ${sharedCount} komanda üzvü ilə` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {doc.storage_path ? (
            <>
              <button type="button" className="chip" style={{ color: 'var(--brand-text)' }} onClick={previewStorage} title="Bax">
                ↗ Bax
              </button>
              <button type="button" className="chip" style={{ color: 'var(--brand-text)' }} onClick={downloadStorage}>
                ↓ Yüklə
              </button>
            </>
          ) : null}
          {doc.external_link ? (
            <a
              href={doc.external_link}
              target="_blank"
              rel="noreferrer noopener"
              className="chip"
              style={{ color: 'var(--brand-text)' }}
            >
              Aç →
            </a>
          ) : null}
          <button
            type="button"
            className="chip"
            style={{ color: 'var(--brand-text)' }}
            onClick={() => setShareOpen((v) => !v)}
          >
            🔗 Paylaş
          </button>
          <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {relativeTime(doc.created_at)}
          </span>
        </div>
      </div>

      {/* Inline share panel: public token + per-user picker */}
      {shareOpen ? (
        <div
          className="mt-3 ml-2 rounded-card p-3"
          style={{ background: 'var(--brand-glow-sm)', border: '1px solid var(--line-soft)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-body font-medium">Paylaşma</h4>
            <button
              type="button"
              className="text-meta"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => setShareOpen(false)}
            >
              ×
            </button>
          </div>

          {/* Public link section */}
          <div className="mb-4">
            <div className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>Publik link</div>
            <button
              type="button"
              className="chip"
              style={{ color: 'var(--brand-text)' }}
              onClick={copyPublicLink}
            >
              {copied === 'share' ? '✓ Kopyalandı' : doc.share_token ? '📋 Linki kopyala' : '+ Link yarat'}
            </button>
          </div>

          {/* shared_with[] team picker */}
          <div>
            <div className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
              Komanda üzvləri ilə paylaş ({sharedCount})
            </div>
            {profiles.isLoading ? (
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
            ) : (
              <div className="max-h-[160px] overflow-y-auto space-y-1">
                {(profiles.data ?? []).map((p) => {
                  const checked = (doc.shared_with ?? []).includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-body">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSharedUser(p.id)}
                      />
                      <span>{p.full_name ?? p.email}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Inline preview modal — iframe to the signed Storage URL */}
      {previewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          style={{ background: 'rgba(14,22,17,0.65)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="bg-surface rounded-card overflow-hidden flex flex-col w-full max-w-4xl"
            style={{ height: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--line-soft)' }}>
              <h3 className="text-h3 truncate flex-1">{doc.title}</h3>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="chip mr-2"
                style={{ color: 'var(--brand-text)' }}
              >
                Yeni səkmədə aç ↗
              </a>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="text-meta opacity-60 hover:opacity-100"
                style={{ color: 'var(--text-muted)', fontSize: 20 }}
                aria-label="Bağla"
              >
                ✕
              </button>
            </div>
            <iframe
              src={previewUrl}
              title={`Sənəd: ${doc.title}`}
              className="flex-1"
              style={{ border: 'none', background: 'var(--canvas)' }}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

// REQ-CRM-07 — Retrospective survey trigger from closeout
function RetroSurveyTrigger({ projectId, clientId }: { projectId: string; clientId: string }) {
  const { profile } = useAuth();
  const [link, setLink] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendSurvey() {
    setSending(true);
    setErr(null);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from('retrospective_surveys').insert({
        project_id: projectId,
        client_id: clientId,
        share_token: token,
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      const url = `${window.location.origin}/retro/${token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card">
      <h3 className="text-h3 mb-2">Müştəri sorğusu</h3>
      <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
        NPS 0–10 + kateqoriya reytinqləri + şərh. Müştəriyə link göndərin.
      </p>
      {link ? (
        <div>
          <p className="text-meta mb-2" style={{ color: 'var(--success-deep)' }}>
            Sorğu yaradıldı — link bufer yaddaşına kopyalandı.
          </p>
          <code
            className="text-meta block p-2 rounded"
            style={{ background: 'var(--surface)', wordBreak: 'break-all' }}
          >
            {link}
          </code>
        </div>
      ) : (
        <>
          {err ? <p className="text-meta mb-2" style={{ color: 'var(--error-deep)' }}>{err}</p> : null}
          <button
            type="button"
            className="btn-outline"
            disabled={sending}
            onClick={sendSurvey}
          >
            {sending ? 'Yaradılır…' : 'Sorğu göndər'}
          </button>
        </>
      )}
    </div>
  );
}

// REQ-PROJ-05 — Award/portfolio submission
// `deadline_month` is int (1-12) per schema 0001 (not 'YYYY-MM').
type SystemAward = {
  id: string;
  name: string;
  organizer: string;
  deadline_month: number | null;
  url: string | null;
  criteria: string | null;
};

const MONTH_NAMES_AZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];

type PortfolioWorkflow = {
  id: string;
  selected_awards: string[];
  applications: Record<string, Record<string, boolean>>;
};

function AwardsSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const { data: awards = [] } = useQuery({
    queryKey: ['system_awards'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_awards')
        .select('*')
        .order('deadline_month');
      return (data ?? []) as SystemAward[];
    },
  });

  const { data: workflow } = useQuery({
    queryKey: ['portfolio_workflow', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('portfolio_workflows')
        .select('id, selected_awards, applications')
        .eq('project_id', projectId)
        .maybeSingle();
      return data as PortfolioWorkflow | null;
    },
  });

  const updateAwards = useMutation({
    mutationFn: async ({ awardId, selected }: { awardId: string; selected: boolean }) => {
      if (!workflow) return;
      const current = workflow.selected_awards ?? [];
      const next = selected
        ? [...current, awardId]
        : current.filter((id) => id !== awardId);
      const { error } = await supabase
        .from('portfolio_workflows')
        .update({ selected_awards: next })
        .eq('id', workflow.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio_workflow', projectId] }),
  });

  const toggleChecklist = useMutation({
    mutationFn: async ({
      awardId, key, val,
    }: { awardId: string; key: string; val: boolean }) => {
      if (!workflow) return;
      const apps = { ...(workflow.applications ?? {}) };
      apps[awardId] = { ...(apps[awardId] ?? {}), [key]: val };
      const { error } = await supabase
        .from('portfolio_workflows')
        .update({ applications: apps })
        .eq('id', workflow.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio_workflow', projectId] }),
  });

  if (awards.length === 0) return null;

  const selectedIds = new Set(workflow?.selected_awards ?? []);
  const today = new Date();

  return (
    <div className="card">
      <h3 className="text-h3 mb-4">Mükafat müraciətləri (REQ-PROJ-05)</h3>
      <div className="space-y-3">
        {awards.map((award) => {
          const isSelected = selectedIds.has(award.id);
          const apps = workflow?.applications?.[award.id] ?? {};

          // Deadline indicator: "Mart (12 gün qaldı)". award.deadline_month is
          // an int 1-12 — same month each year, so we anchor to this year and
          // roll forward when the date has already passed.
          let deadlineLabel = '';
          if (typeof award.deadline_month === 'number') {
            const m = award.deadline_month;
            const monthName = MONTH_NAMES_AZ[m - 1] ?? String(m);
            let year = today.getFullYear();
            let deadline = new Date(year, m - 1, 28);
            if (deadline.getTime() < today.getTime()) {
              year += 1;
              deadline = new Date(year, m - 1, 28);
            }
            const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
            deadlineLabel = `${monthName} ${year} (${daysLeft > 0 ? `${daysLeft} gün qaldı` : 'keçib'})`;
          }

          return (
            <div
              key={award.id}
              className="rounded-card p-3"
              style={{ border: `1px solid ${isSelected ? 'var(--brand-text)' : 'var(--line)'}` }}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) =>
                    updateAwards.mutate({ awardId: award.id, selected: e.target.checked })
                  }
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium">{award.name}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {award.organizer}
                    {deadlineLabel ? ` · ${deadlineLabel}` : ''}
                  </div>
                  {award.url ? (
                    <a
                      href={award.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-meta"
                      style={{ color: 'var(--brand-text)' }}
                    >
                      Ətraflı →
                    </a>
                  ) : null}
                  {isSelected ? (
                    <div className="mt-2 space-y-1">
                      {(['material_ready', 'submitted', 'confirmed'] as const).map((step) => {
                        const labels: Record<string, string> = {
                          material_ready: 'Materiallar hazır',
                          submitted: 'Göndərildi',
                          confirmed: 'Təsdiqləndi',
                        };
                        return (
                          <label key={step} className="flex items-center gap-2 text-meta cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!apps[step]}
                              onChange={(e) =>
                                toggleChecklist.mutate({ awardId: award.id, key: step, val: e.target.checked })
                              }
                            />
                            {labels[step]}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// US-PROJ-05 — Reopen closed project (admin only); appends reopened_at
function ReopenProjectButton({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'active', reopened_at: new Date().toISOString(), archived_at: null })
        .eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  return (
    <div>
      {reopen.error ? (
        <p className="text-meta mb-2" style={{ color: 'var(--error-deep)' }}>
          {(reopen.error as Error).message}
        </p>
      ) : null}
      <button
        className="btn-outline w-full"
        disabled={reopen.isPending}
        onClick={() => reopen.mutate()}
      >
        {reopen.isPending ? 'Açılır…' : 'Layihəni yenidən aç'}
      </button>
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

// PRD §REQ-TASK-08 — bulk-archive tasks with status=done for a single project
function ArchiveDoneTasksChip({ projectId, doneCount }: { projectId: string; doneCount: number }) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tasks')
        .update({ archived_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('status', 'done')
        .is('archived_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-outline"
        onClick={() => setConfirming(true)}
        title="Bu layihənin bütün 'Tamamlandı' tapşırıqlarını arxivlə"
      >
        Tamamlanmışları arxivlə ({doneCount})
      </button>
      <ConfirmDialog
        open={confirming}
        title={`${doneCount} tapşırıq arxivlənsin?`}
        body="Tamamlanmış tapşırıqlar Arxiv səhifəsindən bərpa edilə bilər."
        confirmLabel="Hə, arxivlə"
        busy={archive.isPending}
        onConfirm={() => { archive.mutate(); setConfirming(false); }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

// PRD §6.x — admin manages tags inline (add via input, remove via × on chip)
function ProjectTagsEditor({ projectId, initial, isAdmin }: { projectId: string; initial: string[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  useEffect(() => { setTags(initial); }, [initial]);
  // Datalist of existing tags across all projects
  const allTags = useQuery({
    queryKey: ['project-tags-suggest'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('tags').not('tags', 'is', null);
      const set = new Set<string>();
      for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
        for (const t of row.tags ?? []) set.add(t);
      }
      return Array.from(set).sort();
    },
    staleTime: 60_000,
  });

  async function persist(next: string[]) {
    setTags(next);
    await supabase.from('projects').update({ tags: next }).eq('id', projectId);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  }

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (tags.includes(v)) { setDraft(''); return; }
    void persist([...tags, v]);
    setDraft('');
  }

  if (!isAdmin && tags.length === 0) return null;
  if (!isAdmin) {
    return (
      <div className="flex justify-between gap-4">
        <dt style={{ color: 'var(--text-muted)' }}>Etiketlər</dt>
        <dd className="flex flex-wrap gap-1 justify-end">
          {tags.map((t) => (
            <span key={t} className="chip" style={{ background: 'var(--surface-mist)', fontSize: 11 }}>#{t}</span>
          ))}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-4 items-start">
      <dt style={{ color: 'var(--text-muted)' }}>Etiketlər</dt>
      <dd className="flex flex-wrap gap-1 justify-end items-center" style={{ maxWidth: '70%' }}>
        {tags.map((t) => (
          <span key={t} className="chip flex items-center gap-1" style={{ background: 'var(--surface-mist)', fontSize: 11 }}>
            #{t}
            <button
              type="button"
              onClick={() => persist(tags.filter((x) => x !== t))}
              style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: 11 }}
              title={`#${t} silinsin`}
              aria-label={`#${t} silinsin`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="input"
          style={{ height: 24, fontSize: 11, width: 100 }}
          placeholder="+ etiket"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
            if (e.key === ',') { e.preventDefault(); add(); }
          }}
          onBlur={() => draft.trim() && add()}
          list="project-tag-suggestions-editor"
        />
        <datalist id="project-tag-suggestions-editor">
          {(allTags.data ?? []).filter((t) => !tags.includes(t)).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </dd>
    </div>
  );
}

// Project client — read-only link for non-admin; admin can reassign via dropdown
function ProjectClientLink({
  projectId,
  clientId,
  isAdmin,
}: {
  projectId: string;
  clientId: string | null;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const client = useQuery({
    queryKey: ['project-client', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name, company').eq('id', clientId!).maybeSingle();
      return data as { id: string; name: string; company: string | null } | null;
    },
  });
  const allClients = useQuery({
    queryKey: ['clients', 'active-pick'],
    enabled: editing,
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, company')
        .neq('pipeline_stage', 'archived')
        .order('name');
      return (data ?? []) as Array<{ id: string; name: string; company: string | null }>;
    },
  });
  const reassign = useMutation({
    mutationFn: async (nextId: string | null) => {
      const { error } = await supabase.from('projects').update({ client_id: nextId }).eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-client'] });
      setEditing(false);
    },
  });

  // Non-admin: read-only or hidden
  if (!isAdmin) {
    if (!clientId) return null;
    const c = client.data;
    return (
      <div className="flex justify-between gap-4">
        <dt style={{ color: 'var(--text-muted)' }}>Müştəri</dt>
        <dd>
          {c ? (
            <a href={`/müştərilər?focus=${c.id}`} className="hover:underline" style={{ color: 'var(--brand-text)' }}>
              🤝 {c.name}{c.company ? ` · ${c.company}` : ''}
            </a>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Yüklənir…</span>
          )}
        </dd>
      </div>
    );
  }

  // Admin
  if (editing) {
    return (
      <div className="flex justify-between gap-4 items-center">
        <dt style={{ color: 'var(--text-muted)' }}>Müştəri</dt>
        <dd>
          <select
            autoFocus
            className="input"
            style={{ height: 28, fontSize: 12, maxWidth: 240 }}
            value={clientId ?? ''}
            onChange={(e) => reassign.mutate(e.target.value || null)}
            onBlur={() => setEditing(false)}
            disabled={reassign.isPending}
          >
            <option value="">— təyin edilməyib —</option>
            {(allClients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>
            ))}
          </select>
        </dd>
      </div>
    );
  }
  const c = client.data;
  return (
    <div className="flex justify-between gap-4 items-center">
      <dt style={{ color: 'var(--text-muted)' }}>Müştəri</dt>
      <dd className="flex items-center gap-1">
        {c ? (
          <a href={`/müştərilər?focus=${c.id}`} className="hover:underline" style={{ color: 'var(--brand-text)' }}>
            🤝 {c.name}{c.company ? ` · ${c.company}` : ''}
          </a>
        ) : clientId ? (
          <span style={{ color: 'var(--text-muted)' }}>Yüklənir…</span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>— təyin edilməyib —</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="chip opacity-50 hover:opacity-100"
          style={{ fontSize: 10 }}
          title="Müştərini dəyiş"
        >
          ✎
        </button>
      </dd>
    </div>
  );
}

// Project-wide tracked time = sum across all task time entries
function ProjectTimeTotal({ taskIds }: { taskIds: string[] }) {
  const totals = useTaskTimeTotals(taskIds);
  const sum = Array.from((totals.data ?? new Map()).values()).reduce((s: number, v: number) => s + v, 0);
  if (sum === 0) return null;
  return <Row k="İzlənmiş vaxt" v={formatDuration(sum)} />;
}

// PRD §6.x — project description editor (migration 0054). Click-to-edit
// textarea; read-only italic placeholder for non-admin or empty value.
function ProjectDescriptionEditor({ projectId, initial, isAdmin }: { projectId: string; initial: string | null; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setVal(initial ?? ''); }, [initial, editing]);

  async function save() {
    const trimmed = val.trim();
    if (trimmed === (initial ?? '')) { setEditing(false); return; }
    setSaving(true);
    await supabase.from('projects').update({ description: trimmed || null }).eq('id', projectId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    setEditing(false);
  }

  // Non-admin + empty → hide entirely
  if (!isAdmin && !initial) return null;

  if (!isAdmin) {
    return (
      <div className="flex justify-between gap-4 items-start">
        <dt style={{ color: 'var(--text-muted)' }}>Təsvir</dt>
        <dd className="text-meta" style={{ color: 'var(--text)', textAlign: 'right', maxWidth: '70%', whiteSpace: 'pre-wrap' }}>
          {initial}
        </dd>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex justify-between gap-4 items-start">
        <dt style={{ color: 'var(--text-muted)' }}>Təsvir</dt>
        <dd className="flex-1 text-right">
          <button
            type="button"
            className="text-meta hover:bg-surface-mist px-2 py-1 rounded-btn"
            style={{
              color: initial ? 'var(--text)' : 'var(--text-muted)',
              fontStyle: initial ? 'normal' : 'italic',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
            }}
            onClick={() => setEditing(true)}
          >
            {initial || '+ Təsvir əlavə et'}
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="mb-1" style={{ color: 'var(--text-muted)' }}>Təsvir</dt>
      <textarea
        autoFocus
        className="input w-full"
        rows={3}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setVal(initial ?? ''); setEditing(false); } }}
        style={{ fontSize: 12 }}
      />
      <div className="flex justify-end gap-1 mt-1">
        <button type="button" className="chip" onClick={() => { setVal(initial ?? ''); setEditing(false); }} style={{ fontSize: 11 }}>Ləğv</button>
        <button
          type="button"
          className="chip"
          style={{ color: 'var(--brand-text)', fontSize: 11 }}
          disabled={saving}
          onClick={save}
        >
          {saving ? '…' : 'Saxla'}
        </button>
      </div>
    </div>
  );
}

// PRD §REQ-PROJ — admin inline status dropdown (active/on_hold/closed/cancelled)
function ProjectStatusEditor({ projectId, initial }: { projectId: string; initial: string }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (next: string) => {
      // Closing the project stamps archived_at; reopening clears it.
      const patch: { status: string; archived_at?: string | null } = { status: next };
      if (next === 'closed') patch.archived_at = new Date().toISOString();
      else if (initial === 'closed') patch.archived_at = null;
      const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const STATUS_LABEL: Record<string, string> = {
    active: 'Aktiv',
    on_hold: 'Planlama',
    closed: 'Bağlı',
    cancelled: 'Ləğv',
  };
  return (
    <div className="flex justify-between items-center gap-2">
      <dt style={{ color: 'var(--text-muted)' }}>Status</dt>
      <dd>
        <select
          className="input"
          style={{ height: 28, fontSize: 13, padding: '0 6px' }}
          value={initial}
          onChange={(e) => update.mutate(e.target.value)}
          disabled={update.isPending}
        >
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </dd>
    </div>
  );
}

// PRD §REQ-PROJ-01 — admin inline number editor for payment_buffer_days
function ProjectPaymentBufferEditor({ projectId, initial }: { projectId: string; initial: number }) {
  const qc = useQueryClient();
  const [val, setVal] = useState(String(initial));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(String(initial)); }, [initial]);
  const dirty = String(initial) !== val.trim();
  async function save() {
    const n = Math.max(0, Math.min(365, Number(val) || 0));
    setSaving(true);
    await supabase.from('projects').update({ payment_buffer_days: n }).eq('id', projectId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    setVal(String(n));
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <dt style={{ color: 'var(--text-muted)' }}>Ödəniş gecikməsi (gün)</dt>
      <dd className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={365}
          className="input"
          style={{ height: 28, fontSize: 13, width: 80, fontVariantNumeric: 'tabular-nums' }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        {dirty ? (
          <button type="button" className="chip" disabled={saving} onClick={save} style={{ fontSize: 11, color: 'var(--brand-text)' }}>
            {saving ? '…' : '✓'}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

// PRD §REQ-PROJ-02 — admin toggle for requires_expertise (drives §10.5
// expertise timeline planning). Click chip to flip; persists immediately.
function ProjectExpertiseToggle({ projectId, initial }: { projectId: string; initial: boolean }) {
  const qc = useQueryClient();
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(initial); }, [initial]);

  async function toggle() {
    const next = !val;
    setVal(next);
    setSaving(true);
    await supabase
      .from('projects')
      .update({
        requires_expertise: next,
        // Clear expertise_deadline when toggling off so backward planning
        // doesn't drift on stale data
        ...(next ? {} : { expertise_deadline: null }),
      })
      .eq('id', projectId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  }

  return (
    <div className="flex justify-between items-center gap-2">
      <dt style={{ color: 'var(--text-muted)' }}>Ekspertiza</dt>
      <dd>
        <button
          type="button"
          className="chip"
          style={{
            background: val ? 'var(--brand-action)' : 'var(--surface-mist)',
            color: val ? 'var(--ink)' : 'var(--text-muted)',
            fontSize: 11,
          }}
          disabled={saving}
          onClick={toggle}
          title="Layihə ekspertizadan keçirməlidirmi?"
        >
          {val ? '✓ Lazımdır' : '○ Yox'}
        </button>
      </dd>
    </div>
  );
}

// PRD §UX — inline admin editor for any date column on projects.
// Used for start_date + deadline; same pattern, configurable field/label.
function ProjectDateField({
  projectId,
  field,
  label,
  initial,
}: {
  projectId: string;
  field: 'start_date' | 'deadline' | 'expertise_deadline';
  label: string;
  initial: string | null;
}) {
  const qc = useQueryClient();
  const [val, setVal] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(initial ?? ''); }, [initial]);
  const dirty = (initial ?? '') !== val.trim();
  async function save() {
    setSaving(true);
    await supabase.from('projects').update({ [field]: val || null }).eq('id', projectId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="flex items-center gap-1">
        <input
          type="date"
          className="input"
          style={{ height: 28, fontSize: 13 }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        {dirty ? (
          <button
            type="button"
            className="chip"
            style={{ color: 'var(--brand-text)', fontSize: 11 }}
            disabled={saving}
            onClick={save}
          >
            {saving ? '…' : '✓'}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

// PRD §UX — inline admin editor for project name (click pencil → input → ✓)
// PRD §UX — single-purpose copy-URL chip with "✓ Kopyalandı" flash
function CopyUrlButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard requires secure context */
        }
      }}
      aria-label="Səhifə linkini kopyala"
    >
      {copied ? '✓ Kopyalandı' : '🔗 Kopyala'}
    </button>
  );
}

function ProjectNameEditor({ projectId, initial }: { projectId: string; initial: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial);
  // Reset state if initial changes from outside
  useEffect(() => { setVal(initial); }, [initial]);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!val.trim() || val.trim() === initial) {
      setEditing(false);
      setVal(initial);
      return;
    }
    setSaving(true);
    await supabase.from('projects').update({ name: val.trim() }).eq('id', projectId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    setEditing(false);
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <dt style={{ color: 'var(--text-muted)' }}>Ad</dt>
      <dd className="flex items-center gap-1 min-w-0 flex-1 justify-end">
        {editing ? (
          <>
            <input
              autoFocus
              className="input"
              style={{ height: 28, fontSize: 13, maxWidth: 240 }}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setVal(initial); setEditing(false); }
              }}
              disabled={saving}
            />
            <button type="button" className="chip" disabled={saving} onClick={save} style={{ fontSize: 11, color: 'var(--brand-text)' }}>
              {saving ? '…' : '✓'}
            </button>
            <button type="button" className="chip" onClick={() => { setVal(initial); setEditing(false); }} style={{ fontSize: 11 }}>×</button>
          </>
        ) : (
          <>
            <span className="truncate">{initial}</span>
            <button
              type="button"
              className="chip opacity-50 hover:opacity-100"
              style={{ fontSize: 11 }}
              onClick={() => setEditing(true)}
              title="Adı dəyiş"
            >
              ✎
            </button>
          </>
        )}
      </dd>
    </div>
  );
}

// PRD §REQ-FIN-06 — inline admin editor for project budget (migration 0048)
function ProjectBudgetEditor({ projectId, initialBudget }: { projectId: string; initialBudget: number | null }) {
  const qc = useQueryClient();
  const [val, setVal] = useState(initialBudget != null ? String(initialBudget) : '');
  const [saving, setSaving] = useState(false);
  const dirty = (initialBudget != null ? String(initialBudget) : '') !== val.trim();
  async function save() {
    setSaving(true);
    const num = val.trim() ? Number(val.replace(',', '.')) : null;
    await supabase.from('projects').update({ budget_amount: num }).eq('id', projectId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['project-budget', projectId] });
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <dt style={{ color: 'var(--text-muted)' }}>Büdcə (AZN)</dt>
      <dd className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          step="100"
          className="input"
          style={{ width: 120, height: 28, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="—"
        />
        {dirty ? (
          <button
            type="button"
            className="chip"
            style={{ color: 'var(--brand-text)', fontSize: 11 }}
            disabled={saving}
            onClick={save}
          >
            {saving ? '…' : '✓'}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

// PRD §REQ-PROJ — simple burndown: count of open tasks over last 30 days based
// on created_at + archived_at. Pure-client computation; no extra query.
function TaskBurndown({ tasks }: { tasks: Array<{ created_at: string; archived_at: string | null; status: string }> }) {
  const data = (() => {
    const out: Array<{ day: string; open: number; done: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      const cutoff = dayEnd.getTime();
      let open = 0;
      let done = 0;
      for (const t of tasks) {
        const created = new Date(t.created_at).getTime();
        if (created > cutoff) continue; // not yet created
        const archived = t.archived_at ? new Date(t.archived_at).getTime() : null;
        if (archived && archived <= cutoff) {
          done++;
        } else {
          open++;
        }
      }
      out.push({
        day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d).slice(5),
        open,
        done,
      });
    }
    return out;
  })();

  // Lightweight inline SVG (avoid pulling Recharts here just for two lines)
  const w = 600;
  const h = 80;
  const max = Math.max(1, ...data.map((d) => Math.max(d.open, d.done)));
  const pt = (n: number, i: number) => `${(i / (data.length - 1)) * w},${h - (n / max) * h}`;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1 text-meta" style={{ color: 'var(--text-muted)' }}>
        <span>Son 30 gün burndown</span>
        <span>
          <span style={{ color: 'var(--brand-action)' }}>● Açıq</span>{' '}
          <span style={{ color: 'var(--success-deep, #16794a)', marginLeft: 8 }}>● Tamamlandı</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 60 }}>
        <polyline
          fill="none"
          stroke="var(--brand-action)"
          strokeWidth={2}
          points={data.map((d, i) => pt(d.open, i)).join(' ')}
        />
        <polyline
          fill="none"
          stroke="var(--success-deep, #16794a)"
          strokeWidth={2}
          points={data.map((d, i) => pt(d.done, i)).join(' ')}
        />
      </svg>
    </div>
  );
}
