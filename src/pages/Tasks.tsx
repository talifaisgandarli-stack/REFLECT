import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { AvatarGroup } from '@/components/AvatarGroup';
import { isOpenChildrenError, useTasks, useUpdateTaskStatus } from '@/lib/hooks';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TaskCreateModal } from '@/components/TaskCreateModal';
import { CancelTaskModal } from '@/components/CancelTaskModal';
import { TaskCommentsModal } from '@/components/TaskCommentsModal';
import { TaskEditModal } from '@/components/TaskEditModal';
import { downloadCsv } from '@/lib/csv';
import { toast } from '@/components/Toast';

// US-TASK-06 — deadline-based groups for personal view
const todayStr = new Date().toISOString().slice(0, 10);
const endOfWeekStr = (() => {
  const d = new Date();
  const diff = 7 - (d.getDay() === 0 ? 7 : d.getDay());
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
})();

type TimeGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';
const TIME_GROUP_LABEL: Record<TimeGroup, string> = {
  overdue: 'Gecikmiş',
  today: 'Bu gün',
  week: 'Bu həftə',
  later: 'Sonra',
  none: 'Deadline yoxdur',
};
const TIME_GROUP_COLOR: Record<TimeGroup, string> = {
  overdue: 'var(--error)',
  today: 'var(--warning)',
  week: 'var(--success)',
  later: 'var(--text-muted)',
  none: 'var(--text-muted)',
};
function taskTimeGroup(t: Task): TimeGroup {
  if (!t.deadline) return 'none';
  if (t.deadline < todayStr) return 'overdue';
  if (t.deadline === todayStr) return 'today';
  if (t.deadline <= endOfWeekStr) return 'week';
  return 'later';
}
const TIME_GROUP_ORDER: TimeGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

export function TasksPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [mineOnly, setMineOnly] = useState(false);
  const { data: tasks = [], isLoading } = useTasks(
    mineOnly && profile?.id ? { assigneeId: profile.id } : undefined,
  );
  const update = useUpdateTaskStatus();

  // PRD §6.8 — AvatarGroup: look up names/avatars for assignee_ids
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles', 'mini-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('is_active', true);
      return (data ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
  const profileById = useMemo(
    () => Object.fromEntries(allProfiles.map((p) => [p.id, p])),
    [allProfiles],
  );
  function assigneePeople(ids: string[]) {
    return ids.map((id) => ({
      id,
      name: profileById[id]?.full_name ?? null,
      avatar_url: profileById[id]?.avatar_url ?? null,
    }));
  }
  const [blocker, setBlocker] = useState<{ id: string; from?: TaskStatus } | null>(null);
  const [creating, setCreating] = useState(false);
  const [quickAddCol, setQuickAddCol] = useState<TaskStatus | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; title: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [commenting, setCommenting] = useState<{ id: string; title: string } | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  // PRD §6.x — bulk action mode for the table/list view
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState('');

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
    setReassignOpen(false);
  }

  const bulkArchiveSelected = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('tasks')
        .update({ archived_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      exitBulkMode();
      if (count) toast.success(`${count} tapşırıq arxivləndi`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkReassign = useMutation({
    mutationFn: async (newAssigneeId: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0 || !newAssigneeId) return;
      // Multi-assignee model: replace entire assignee_ids array on each row.
      const { error } = await supabase
        .from('tasks')
        .update({ assignee_ids: [newAssigneeId] })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      exitBulkMode();
    },
  });

  // PRD §6.x — clone a task (title + project + duration + assignees).
  // New task lands in "queued" status with a "(kopya)" suffix.
  const cloneTask = useMutation({
    mutationFn: async (sourceId: string) => {
      const src = tasks.find((t) => t.id === sourceId);
      if (!src) throw new Error('Tapşırıq tapılmadı');
      const { error } = await supabase.from('tasks').insert({
        title: `${src.title} (kopya)`,
        description: src.description,
        project_id: src.project_id,
        status: 'queued',
        assignee_ids: src.assignee_ids,
        deadline: src.deadline,
        estimated_duration: src.estimated_duration,
        duration_unit: src.duration_unit,
        risk_buffer_pct: src.risk_buffer_pct,
        is_expertise_subtask: src.is_expertise_subtask,
        task_level: src.task_level,
        // parent_task_id intentionally not copied — clone is a top-level task
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
  // Persist search filter in URL so refresh / share-link preserves it.
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set('q', search);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const archivableCount = useMemo(
    () => tasks.filter((t) => t.status === 'done' || t.status === 'cancelled').length,
    [tasks],
  );

  const bulkArchive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tasks')
        .update({ archived_at: new Date().toISOString() })
        .in('status', ['done', 'cancelled'])
        .is('archived_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setConfirmArchive(false);
    },
  });

  function moveTask(id: string, status: TaskStatus, from?: TaskStatus) {
    if (status === 'cancelled') {
      const t = tasks.find((x) => x.id === id);
      setCancelling({ id, title: t?.title ?? '' });
      return;
    }
    update.mutate(
      { id, status, from },
      {
        onError: (e) => {
          if (status === 'done' && isOpenChildrenError(e)) {
            setBlocker({ id, from });
          }
        },
      },
    );
  }

  // PRD §6.x — task templates (admin defines, anyone instantiates)
  const templates = useQuery({
    queryKey: ['task-templates'],
    queryFn: async () => {
      const { data } = await supabase
        .from('task_templates')
        .select('id, name, title, description, estimated_duration, duration_unit, risk_buffer_pct, labels, is_expertise_subtask')
        .order('name', { ascending: true });
      return (data ?? []) as Array<{
        id: string;
        name: string;
        title: string;
        description: string | null;
        estimated_duration: number | null;
        duration_unit: string | null;
        risk_buffer_pct: number;
        labels: string[] | null;
        is_expertise_subtask: boolean;
      }>;
    },
  });

  const createFromTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const tpl = templates.data?.find((t) => t.id === templateId);
      if (!tpl) throw new Error('Şablon tapılmadı');
      const { error } = await supabase.from('tasks').insert({
        title: tpl.title,
        description: tpl.description,
        status: 'queued',
        estimated_duration: tpl.estimated_duration,
        duration_unit: tpl.duration_unit,
        risk_buffer_pct: tpl.risk_buffer_pct,
        labels: tpl.labels ?? [],
        is_expertise_subtask: tpl.is_expertise_subtask,
        assignee_ids: profile?.id ? [profile.id] : [],
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  // PRD §6.x — label filter (chip row above the kanban)
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) for (const l of t.labels ?? []) set.add(l);
    return Array.from(set).sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    let out = tasks;
    if (labelFilter) out = out.filter((t) => (t.labels ?? []).includes(labelFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((t) => t.title.toLowerCase().includes(q));
    }
    return out;
  }, [tasks, search, labelFilter]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      idea: [], queued: [], active: [], review: [], expert: [], done: [], cancelled: [],
    };
    for (const t of filtered) map[t.status].push(t);
    return map;
  }, [filtered]);

  // US-TASK-06 — time-grouped personal view computed data
  const groupedByTime = useMemo(() => {
    const map = {} as Record<TimeGroup, Task[]>;
    for (const g of TIME_GROUP_ORDER) map[g] = [];
    for (const t of filtered) {
      if (t.status === 'done' || t.status === 'cancelled') continue;
      map[taskTimeGroup(t)].push(t);
    }
    return map;
  }, [filtered]);

  const meta = `${filtered.length} cəmi · ${grouped.active.length} icrada · ${grouped.review.length} yoxlamada`;

  return (
    <>
      <PageHead
        meta={meta}
        title="Tapşırıqlar"
        actions={
          <>
            <input
              className="input max-w-[240px]"
              placeholder="Axtar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              Mənim
            </button>
            {isAdmin && archivableCount > 0 ? (
              <button className="btn-outline" onClick={() => setConfirmArchive(true)}>
                Arxivlə ({archivableCount})
              </button>
            ) : null}
            {view === 'table' ? (
              <button
                className={`btn-outline ${bulkMode ? 'border-brand-text' : ''}`}
                onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
                style={bulkMode ? { background: 'var(--brand-action)', color: 'var(--ink)' } : undefined}
              >
                {bulkMode ? `✓ Seçim (${selectedIds.size})` : 'Seç'}
              </button>
            ) : null}
            <button
              className="btn-outline"
              disabled={filtered.length === 0}
              onClick={() => {
                downloadCsv(
                  `tasks-${new Date().toISOString().slice(0, 10)}`,
                  ['Başlıq', 'Status', 'Layihə', 'Deadline', 'İcraçılar', 'Yaradıldı'],
                  filtered.map((t) => ({
                    'Başlıq': t.title,
                    'Status': t.status,
                    'Layihə': t.project_id ?? '',
                    'Deadline': t.deadline ?? '',
                    'İcraçılar': (t.assignee_ids ?? []).join('; '),
                    'Yaradıldı': t.created_at ? new Date(t.created_at).toISOString() : '',
                  })),
                );
              }}
              title={`${filtered.length} sıra ixrac et`}
            >
              ↓ CSV
            </button>
            {/* PRD §6.x — Şablondan yarat (visible only when templates exist) */}
            {(templates.data ?? []).length > 0 ? (
              <select
                className="input max-w-[200px]"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    createFromTemplate.mutate(e.target.value);
                    e.target.value = '';
                  }
                }}
                disabled={createFromTemplate.isPending}
              >
                <option value="">Şablondan yarat…</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : null}
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni
            </button>
          </>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['board', 'table'] as const).map((v) => (
          <button
            key={v}
            className={`chip ${view === v ? 'chip-brand' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'board' ? 'Lövhə' : 'Cədvəl'}
          </button>
        ))}
        {/* PRD §6.x — label filter chips */}
        {allLabels.length > 0 ? (
          <>
            <span style={{ width: 1, background: 'var(--line)', margin: '0 4px' }} />
            <button
              className={`chip ${labelFilter === null ? 'chip-brand' : ''}`}
              onClick={() => setLabelFilter(null)}
            >
              Bütün etiketlər
            </button>
            {allLabels.map((l) => (
              <button
                key={l}
                className={`chip ${labelFilter === l ? 'chip-brand' : ''}`}
                onClick={() => setLabelFilter(labelFilter === l ? null : l)}
              >
                # {l}
              </button>
            ))}
          </>
        ) : null}
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="Hələ tapşırıq yoxdur"
          body="İlk tapşırığı yarat və BU GÜN sütunu canlanacaq."
          cta={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni tapşırıq
            </button>
          }
        />
      ) : mineOnly ? (
        // US-TASK-06 — personal view: time-grouped list with inline actions
        <div className="space-y-6">
          {TIME_GROUP_ORDER.map((g) => {
            const items = groupedByTime[g];
            if (!items.length) return null;
            return (
              <section key={g}>
                <h3
                  className="text-tiny mb-3"
                  style={{ color: TIME_GROUP_COLOR[g], letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  {TIME_GROUP_LABEL[g]} · {items.length}
                </h3>
                <div className="space-y-1">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 py-2 px-3 rounded-card"
                      style={{
                        background: bulkMode && selectedIds.has(t.id) ? 'var(--brand-glow-sm)' : 'var(--surface)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={bulkMode ? selectedIds.has(t.id) : false}
                        onChange={() => bulkMode ? toggleSelected(t.id) : moveTask(t.id, 'done', t.status)}
                        style={{ accentColor: 'var(--brand-action)', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                        aria-label={bulkMode ? `${t.title} seç` : `${t.title} tamamlandı`}
                      />
                      <span
                        className="flex-1 text-body cursor-pointer"
                        onClick={() => setCommenting({ id: t.id, title: t.title })}
                      >
                        {t.title}
                      </span>
                      {t.deadline ? (
                        <span
                          className="text-meta"
                          style={{ color: TIME_GROUP_COLOR[g], fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
                        >
                          {t.deadline}
                        </span>
                      ) : null}
                      <span
                        className="text-meta px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface-raised)', color: TASK_STATUS_TONE[t.status].text, flexShrink: 0 }}
                      >
                        {TASK_STATUS_LABEL[t.status]}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCommenting({ id: t.id, title: t.title })}
                        className="opacity-60 hover:opacity-100"
                        style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}
                        aria-label="Şərhlər"
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelling({ id: t.id, title: t.title })}
                        className="text-meta opacity-60 hover:opacity-100"
                        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                        aria-label={`Tapşırığı ləğv et: ${t.title}`}
                      >
                        Ləğv et
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {TIME_GROUP_ORDER.every((g) => !groupedByTime[g].length) && (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Aktiv tapşırıq yoxdur.</p>
          )}
        </div>
      ) : view === 'board' ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {TASK_STATUS_ORDER.map((s) => {
            const isToday = s === 'active';
            const tone = TASK_STATUS_TONE[s];
            return (
              <div
                key={s}
                className="rounded-card p-3"
                style={{
                  background: isToday ? 'var(--ink)' : 'transparent',
                  color: isToday ? 'var(--canvas)' : 'inherit',
                  border: isToday ? 'none' : '1px dashed var(--line)',
                  minHeight: 320,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData('text/plain');
                  if (!raw) return;
                  const { id, from } = JSON.parse(raw);
                  if (from !== s) moveTask(id, s, from);
                }}
              >
                <h3
                  className="text-tiny mb-3"
                  style={{
                    color: isToday ? 'var(--brand-action)' : tone.text,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {isToday ? 'BU GÜN' : TASK_STATUS_LABEL[s]} · {grouped[s].length}
                </h3>
                <div className="space-y-2" role="list" aria-label={TASK_STATUS_LABEL[s]}>
                  {grouped[s].map((t) => (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ id: t.id, from: t.status }),
                        )
                      }
                      className="rounded-card p-3 text-body"
                      style={{
                        background: isToday ? 'var(--card-dark-bg)' : 'var(--surface)',
                        border: `1px solid ${isToday ? 'var(--card-dark-border)' : 'var(--line)'}`,
                      }}
                    >
                      <div
                        className="font-medium cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setCommenting({ id: t.id, title: t.title }); }}
                        title={t.description ?? undefined}
                      >
                        {t.title}
                      </div>
                      {/* Assignee avatars — PRD §6.8 */}
                      {t.assignee_ids.length > 0 && (
                        <div className="mt-1">
                          <AvatarGroup people={assigneePeople(t.assignee_ids)} size={20} />
                        </div>
                      )}
                      {/* PRD §6.x — priority + label chips on board card */}
                      {(t.priority || (t.labels ?? []).length > 0) ? (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {t.priority ? (
                            <span
                              className="chip"
                              style={{
                                background:
                                  t.priority === 'high' ? 'var(--error-aa, #8a1e18)' :
                                  t.priority === 'medium' ? 'var(--warning-aa, #8a5800)' :
                                  'var(--surface-mist)',
                                color: t.priority === 'low' ? 'var(--text-muted)' : 'white',
                                fontSize: 9,
                                padding: '0 5px',
                              }}
                              title={`Prioritet: ${t.priority}`}
                            >
                              {t.priority === 'high' ? '↑' : t.priority === 'medium' ? '→' : '↓'}
                            </span>
                          ) : null}
                          {(t.labels ?? []).slice(0, 2).map((l) => (
                            <span
                              key={l}
                              className="chip"
                              style={{
                                background: isToday ? 'var(--card-dark-border)' : 'var(--surface-mist)',
                                color: isToday ? 'var(--canvas)' : 'var(--text-muted)',
                                fontSize: 9,
                                padding: '0 5px',
                              }}
                            >
                              #{l}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between mt-1">
                        {t.deadline ? (
                          <span
                            className="text-meta"
                            style={{
                              color: isToday ? 'var(--text-faint)' : 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {t.deadline}
                          </span>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-2">
                          {/* Keyboard alternative to drag-drop: status select. */}
                          <select
                            aria-label="Status dəyiş"
                            value={t.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const next = e.target.value as TaskStatus;
                              if (next === t.status) return;
                              moveTask(t.id, next, t.status);
                            }}
                            className="text-meta rounded-btn"
                            style={{
                              background: isToday ? 'var(--card-dark-border)' : 'var(--surface-mist)',
                              color: isToday ? 'var(--canvas)' : 'var(--text-soft)',
                              fontSize: 11,
                              padding: '2px 4px',
                              border: 'none',
                            }}
                          >
                            {TASK_STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                            className="text-meta opacity-60 hover:opacity-100"
                            style={{ color: isToday ? 'var(--text-faint)' : 'var(--text-muted)', fontSize: 13 }}
                            aria-label="Düzəlt"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCommenting({ id: t.id, title: t.title }); }}
                            className="text-meta opacity-60 hover:opacity-100"
                            style={{ color: isToday ? 'var(--text-faint)' : 'var(--text-muted)', fontSize: 13 }}
                            aria-label="Şərhlər"
                          >
                            💬
                          </button>
                          {t.status !== 'done' && t.status !== 'cancelled' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelling({ id: t.id, title: t.title });
                              }}
                              className="text-meta opacity-60 hover:opacity-100"
                              style={{
                                color: isToday ? 'var(--text-faint)' : 'var(--text-muted)',
                              }}
                              aria-label={`Tapşırığı ləğv et: ${t.title}`}
                            >
                              Ləğv et
                            </button>
                          ) : null}
                          {/* PRD §6.x — clone task chip (board view) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cloneTask.mutate(t.id);
                            }}
                            className="text-meta opacity-60 hover:opacity-100"
                            style={{ color: isToday ? 'var(--text-faint)' : 'var(--text-muted)' }}
                            aria-label={`Tapşırığı klonla: ${t.title}`}
                            title="Tapşırığı klonla"
                            disabled={cloneTask.isPending}
                          >
                            ⎘
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {/* Quick-add per column: opens TaskCreateModal pre-set to this status */}
                <button
                  type="button"
                  className="mt-2 w-full text-left text-meta opacity-50 hover:opacity-100 py-1 px-2 rounded-btn"
                  style={{ color: isToday ? 'var(--brand-action)' : 'var(--text-muted)', fontSize: 12 }}
                  onClick={() => setQuickAddCol(s)}
                  aria-label={`${TASK_STATUS_LABEL[s]} sütununa tapşırıq əlavə et`}
                >
                  + Tapşırıq
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Tapşırıq', 'Status', 'İcraçı', 'Deadline'].map((h) => (
                <th
                  key={h}
                  className="text-meta text-left py-3 px-3"
                  style={{
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{t.title}</td>
                <td className="py-3 px-3">{TASK_STATUS_LABEL[t.status]}</td>
                <td className="py-3 px-3">
                  <AvatarGroup people={assigneePeople(t.assignee_ids)} size={24} />
                </td>
                <td className="py-3 px-3">
                  {t.deadline ? (
                    <span
                      style={{
                        color: TIME_GROUP_COLOR[taskTimeGroup(t)],
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {t.deadline}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {blocker ? (
        <SubtaskBlockingModal
          parentTaskId={blocker.id}
          onCancel={() => setBlocker(null)}
          onResolved={() => {
            const b = blocker;
            setBlocker(null);
            if (b) moveTask(b.id, 'done', b.from);
          }}
        />
      ) : null}

      {creating ? <TaskCreateModal onClose={() => setCreating(false)} /> : null}
      {quickAddCol ? (
        <TaskCreateModal
          defaultStatus={quickAddCol}
          onClose={() => setQuickAddCol(null)}
        />
      ) : null}

      {cancelling ? (
        <CancelTaskModal
          taskId={cancelling.id}
          taskTitle={cancelling.title}
          onCancel={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            update.reset();
          }}
        />
      ) : null}

      {commenting ? (
        <TaskCommentsModal
          taskId={commenting.id}
          taskTitle={commenting.title}
          onClose={() => setCommenting(null)}
        />
      ) : null}

      {editing ? (
        <TaskEditModal task={editing} onClose={() => setEditing(null)} />
      ) : null}

      {/* PRD §6.x — bulk action floating bar (table view only) */}
      {bulkMode && selectedIds.size > 0 ? (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-capsule px-4 py-3 flex items-center gap-3 shadow-xl z-40"
          style={{
            background: 'var(--ink)',
            color: 'var(--canvas)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: 320,
          }}
        >
          <span className="text-body font-medium">{selectedIds.size} seçili</span>
          <span style={{ flex: 1 }} />
          {isAdmin ? (
            <div className="relative">
              <button
                type="button"
                className="chip"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--canvas)' }}
                onClick={() => setReassignOpen((v) => !v)}
              >
                Yenidən təyin et
              </button>
              {reassignOpen ? (
                <div
                  className="absolute bottom-full mb-2 right-0 rounded-card p-2 w-[220px]"
                  style={{
                    background: 'var(--ink)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <select
                    className="input w-full mb-2"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)' }}
                    value={reassignTarget}
                    onChange={(e) => setReassignTarget(e.target.value)}
                  >
                    <option value="">İcraçı seçin…</option>
                    {allProfiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                    ))}
                  </select>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      className="chip text-meta"
                      onClick={() => { setReassignOpen(false); setReassignTarget(''); }}
                    >
                      Ləğv
                    </button>
                    <button
                      type="button"
                      className="chip"
                      style={{ background: 'var(--brand-action)', color: 'var(--ink)' }}
                      disabled={!reassignTarget || bulkReassign.isPending}
                      onClick={() => bulkReassign.mutate(reassignTarget)}
                    >
                      {bulkReassign.isPending ? '…' : 'Təyin et'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--canvas)' }}
            disabled={bulkArchiveSelected.isPending}
            onClick={() => bulkArchiveSelected.mutate()}
          >
            {bulkArchiveSelected.isPending ? 'Arxivlənir…' : 'Arxivlə'}
          </button>
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)' }}
            onClick={exitBulkMode}
            aria-label="Seçim rejimini bağla"
          >
            ×
          </button>
        </div>
      ) : null}

      {confirmArchive ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(14,22,17,0.55)' }}
          onClick={() => setConfirmArchive(false)}
        >
          <div
            className="bg-surface p-6 rounded-card w-[380px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-h2 mb-2">Toplu arxivləmə</h2>
            <p className="text-body mb-5" style={{ color: 'var(--text-muted)' }}>
              {archivableCount} ədəd <strong>Tamamlandı</strong> / <strong>Ləğv edildi</strong>{' '}
              tapşırığı arxivlənəcək. Tapşırıqlar lövhədən silinəcək; Arxiv bölməsindən bərpa edilə bilər.
            </p>
            {bulkArchive.error ? (
              <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
                {(bulkArchive.error as Error).message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setConfirmArchive(false)}>
                Ləğv et
              </button>
              <button
                className="btn-primary"
                disabled={bulkArchive.isPending}
                onClick={() => bulkArchive.mutate()}
              >
                {bulkArchive.isPending ? 'Arxivlənir…' : 'Arxivlə'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
