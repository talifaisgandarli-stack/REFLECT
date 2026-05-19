import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { AvatarGroup } from '@/components/AvatarGroup';
import { isOpenChildrenError, useTasks, useUpdateTaskStatus } from '@/lib/hooks';
import { useSlashFocus } from '@/lib/useSlashFocus';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth, useUI } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TaskCreateModal } from '@/components/TaskCreateModal';
import { CancelTaskModal } from '@/components/CancelTaskModal';
import { TaskCommentsModal } from '@/components/TaskCommentsModal';
import { TaskEditModal } from '@/components/TaskEditModal';
import { downloadCsv } from '@/lib/csv';
import { toast } from '@/components/Toast';
import { formatDuration, useActiveTimeEntry, useStartTimer, useStopTimer, useTaskTimeTotals } from '@/lib/useTimeTracking';
import { useFocusTrap } from '@/lib/a11y';

// US-TASK-06 — deadline-based groups for personal view.
// PRD §FIN-09 — all date math anchored to Asia/Baku, not UTC. Without this,
// users at 23:00 Baku (still "today") saw tomorrow's tasks as overdue because
// new Date().toISOString() rolled over to UTC midnight.
function bakuDateString(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d);
}
// PRD §FIN-09 — recompute on every call (the module-scoped freeze meant a
// tab kept open past Baku midnight stayed on yesterday's date, so tasks due
// "tomorrow" stayed in the "today" bucket all night).
function endOfWeekStrFor(now: Date): string {
  // Compute end-of-week using Baku-shifted Date so the wraparound on Saturday
  // night doesn't get clipped one day early in UTC.
  const bakuMs = now.getTime() + 4 * 3_600_000; // UTC+4
  const d = new Date(bakuMs);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (7 - dow));
  return bakuDateString(new Date(d.getTime() - 4 * 3_600_000));
}

type TimeGroup = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done_today';
const TIME_GROUP_LABEL: Record<TimeGroup, string> = {
  overdue: 'Gecikmiş',
  today: 'Bu gün',
  week: 'Bu həftə',
  later: 'Sonra',
  none: 'Deadline yoxdur',
  done_today: 'Bu gün tamamladıqlarım',
};
const TIME_GROUP_COLOR: Record<TimeGroup, string> = {
  overdue: 'var(--error)',
  today: 'var(--warning)',
  week: 'var(--success)',
  later: 'var(--text-muted)',
  none: 'var(--text-muted)',
  done_today: 'var(--success-deep, #16794a)',
};
// PRD §UX — Azərbaycan hərflərini soft-match: "Xərçə" yazana "xerce" gəlsin.
// `String.normalize('NFD')` ə/ı üçün diacritic ayırmır, ona görə explicit map.
const AZ_FOLD: Record<string, string> = {
  'ə': 'e', 'ş': 's', 'ç': 'c', 'ö': 'o', 'ü': 'u', 'ı': 'i', 'ğ': 'g',
  'Ə': 'e', 'Ş': 's', 'Ç': 'c', 'Ö': 'o', 'Ü': 'u', 'I': 'i', 'İ': 'i', 'Ğ': 'g',
};
function normalizeAz(s: string): string {
  let out = '';
  for (const ch of s) out += AZ_FOLD[ch] ?? ch.toLowerCase();
  return out;
}

function taskTimeGroup(t: Task): TimeGroup {
  // PRD US-TASK-06 — done items get their own group at the bottom so users
  // can untick an accidental completion. archived_at is auto-stamped by the
  // tasks_auto_archive trigger (0006); we filter to today's done in the
  // personal grouping step so the list stays scoped to recent work.
  if (t.status === 'done') return 'done_today';
  if (!t.deadline) return 'none';
  const today = bakuDateString();
  const eow = endOfWeekStrFor(new Date());
  if (t.deadline < today) return 'overdue';
  if (t.deadline === today) return 'today';
  if (t.deadline <= eow) return 'week';
  return 'later';
}
const TIME_GROUP_ORDER: TimeGroup[] = ['overdue', 'today', 'week', 'later', 'none', 'done_today'];

export function TasksPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'board' | 'table'>('board');
  // PRD §UX — ?assignee=<uuid> deep-links from Roster to "tasks for this
  // person". useSearchParams is reactive — SPA navigation between route
  // changes will re-render with the new value; previous module-scoped
  // `new URLSearchParams(window.location.search)` read was stale.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialUrlAssignee = searchParams.get('assignee');
  const [mineOnly, setMineOnly] = useState(false);
  // PRD §UX — drag-over column highlight (board view DnD feedback)
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  // PRD §6.6 — HTML5 drag-and-drop doesn't fire on iOS/Android; the per-card
  // <select> is the documented fallback. Suppress the dashed drop-zone visual
  // on touch devices so users don't expect a drag affordance that won't work.
  const isTouch = typeof window !== 'undefined' && (
    'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
  );
  // URL assignee takes precedence over mineOnly so Roster click always lands on that user
  const filterAssignee = initialUrlAssignee || (mineOnly && profile?.id ? profile.id : null);
  // Memoize the filter object so its identity is stable across renders.
  // useQuery's queryKey serializes the value, but the object identity also
  // affects react-query's internal cache normalisation; a fresh `{}` every
  // render thrashes the cache slot.
  const tasksFilter = useMemo(
    () => (filterAssignee ? { assigneeId: filterAssignee } : undefined),
    [filterAssignee],
  );
  const { data: tasks = [], isLoading } = useTasks(tasksFilter);
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
  // PRD §REQ-TASK-01 — parent title lookup for subtask breadcrumb on board cards
  const parentTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) m.set(t.id, t.title);
    return m;
  }, [tasks]);
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

  // PRD §REQ-TASK — subtask navigation: TaskCommentsModal dispatches
  // 'reflect:open-task' when user clicks a subtask or the parent back-chip.
  // Tasks.tsx (modal owner) swaps the open task without re-rendering tree.
  useEffect(() => {
    function onOpenTask(e: Event) {
      const detail = (e as CustomEvent).detail as { id?: string; title?: string };
      if (detail?.id && detail.title) {
        setCommenting({ id: detail.id, title: detail.title });
      }
    }
    window.addEventListener('reflect:open-task', onOpenTask);
    return () => window.removeEventListener('reflect:open-task', onOpenTask);
  }, []);
  const [editing, setEditing] = useState<Task | null>(null);
  // PRD §6.3 — when a task is open in EITHER the edit modal OR the comments
  // modal, Cmd+N creates a subtask of it. Comments is the more common entry
  // point, so publishing parent context from that state too is essential.
  const setTaskCreateParent = useUI((s) => s.setTaskCreateParent);
  useEffect(() => {
    // Edit modal takes precedence (it has the full Task object); fall back to
    // the lighter `commenting` ref (id + title) when there is no edit open.
    if (editing) {
      setTaskCreateParent({ id: editing.id, level: editing.task_level ?? 0 });
    } else if (commenting) {
      // We don't have task_level on the commenting ref — look it up from
      // the tasks cache; default to 0 (top-level subtask depth).
      const t = tasks.find((x) => x.id === commenting.id);
      setTaskCreateParent({ id: commenting.id, level: t?.task_level ?? 0 });
    } else {
      setTaskCreateParent(null);
    }
    return () => setTaskCreateParent(null);
  }, [editing, commenting, tasks, setTaskCreateParent]);
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

  // PRD §REQ-TASK-02 — bulk-add an assignee. Per-row read+merge so existing
  // multi-assignees are preserved (previous version replaced the entire array,
  // silently dropping co-assignees).
  const bulkReassign = useMutation({
    mutationFn: async (newAssigneeId: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0 || !newAssigneeId) return;
      const selectedTasks = tasks.filter((t) => ids.includes(t.id));
      // Issue one update per task to merge instead of clobber. Sequential to
      // keep the trigger volume sane; 99% of bulk ops are <30 rows.
      for (const t of selectedTasks) {
        const existing = t.assignee_ids ?? [];
        if (existing.includes(newAssigneeId)) continue;
        const next = [...existing, newAssigneeId];
        const { error } = await supabase
          .from('tasks')
          .update({ assignee_ids: next })
          .eq('id', t.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('İcraçı təyin edildi');
      exitBulkMode();
    },
    onError: (e) => {
      // PRD §UX — the loop above mutates row-by-row, so a mid-batch RLS
      // rejection leaves earlier rows updated and later rows untouched.
      // Surface the error so the user knows the batch was partial, then
      // refetch + exit bulk mode so the cache reflects reality.
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.error(`Bəzi tapşırıqlar təyin edilmədi: ${(e as Error).message}`);
      exitBulkMode();
    },
  });

  // PRD §6.x — clone a task (title + project + duration + assignees).
  // New task lands in "queued" status with a "(kopya)" suffix.
  const cloneTask = useMutation({
    mutationFn: async (sourceId: string) => {
      const src = tasks.find((t) => t.id === sourceId);
      if (!src) throw new Error('Tapşırıq tapılmadı');
      // PRD §REQ-TASK-03 — clone lands at the BOTTOM of the 'queued' column,
      // i.e. max(sort_order)+1024 for siblings in the same (project, queued)
      // bucket. Leaving sort_order null caused the clone to sort by
      // Infinity and appear last in unstable order alongside other nulls.
      const siblings = tasks.filter(
        (t) => t.status === 'queued' && t.project_id === src.project_id,
      );
      const maxSort = siblings.reduce(
        (m, t) => Math.max(m, t.sort_order ?? -Infinity),
        -Infinity,
      );
      const nextSort = Number.isFinite(maxSort) ? maxSort + 1024 : 1024;
      const { error } = await supabase.from('tasks').insert({
        title: `${src.title} (kopya)`,
        description: src.description,
        project_id: src.project_id,
        status: 'queued',
        assignee_ids: src.assignee_ids,
        start_date: src.start_date,
        deadline: src.deadline,
        estimated_duration: src.estimated_duration,
        duration_unit: src.duration_unit,
        risk_buffer_pct: src.risk_buffer_pct,
        is_expertise_subtask: src.is_expertise_subtask,
        task_level: src.task_level,
        labels: src.labels ?? null,
        priority: src.priority ?? null,
        sort_order: nextSort,
        // parent_task_id intentionally not copied — clone is a top-level task
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tapşırıq kopyalandı');
    },
    onError: (e) => toast.error((e as Error).message || 'Kopyalanmadı'),
  });
  // Persist search filter in URL so refresh / share-link preserves it.
  // searchParams/setSearchParams are already destructured at component top.
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  // PRD §6.3 / §UX — Slack/GitHub-style "/" jumps to search box
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchInputRef);
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
        onSuccess: () => {
          // PRD §UX — undo toast for status moves. Available for ~7s; clicking
          // "Geri al" reverts to the prior status. Skipped when no `from` is
          // known (programmatic moves like initial creation).
          if (from && from !== status && status === 'done') {
            toast.undo('Tapşırıq tamamlandı', {
              label: 'Geri al',
              onClick: async () => {
                // Verify the task still exists before reverting — a 0-row
                // UPDATE doesn't error and would silently no-op, leaving the
                // user thinking undo worked.
                const { data } = await supabase
                  .from('tasks')
                  .select('id')
                  .eq('id', id)
                  .maybeSingle();
                if (!data) {
                  toast.error('Tapşırıq artıq yoxdur — bərpa edilə bilmir');
                  return;
                }
                update.mutate({ id, status: from, from: status });
              },
            });
          }
        },
        onError: (e) => {
          if (status === 'done' && isOpenChildrenError(e)) {
            setBlocker({ id, from });
          }
        },
      },
    );
  }

  // PRD §REQ-TASK-03 — intra-column reorder via fractional indexing. Caller
  // passes the dragged task id and the target neighbor's id (the card the
  // user dropped ABOVE). We compute the new sort_order between that neighbor
  // and its predecessor; if it's the top, use predecessor sort/2 (or -1024).
  const reorderTask = useMutation({
    mutationFn: async (input: { id: string; column: TaskStatus; targetId: string | null }) => {
      const col = grouped[input.column];
      const targetIdx = input.targetId ? col.findIndex((t) => t.id === input.targetId) : col.length;
      if (targetIdx < 0) return;
      const above = targetIdx > 0 ? col[targetIdx - 1] : null;
      const below = targetIdx < col.length ? col[targetIdx] : null;
      const aboveSort = above?.sort_order ?? null;
      const belowSort = below?.sort_order ?? null;

      // PRD §REQ-TASK-03 — fractional-index precision falls off after many
      // midsplits on the same slot. Detect collapse (gap < 1) and rebalance
      // the column once before continuing so subsequent splits have room.
      if (aboveSort != null && belowSort != null && Math.abs(aboveSort - belowSort) < 1) {
        await supabase.rpc('rebalance_task_sort_order', {
          p_project_id: above?.project_id ?? null,
          p_status: input.column,
        });
        // Refetch so we pick up the rebalanced values for the math below.
        const { data: refreshed } = await supabase
          .from('tasks')
          .select('id, sort_order')
          .in('id', [above!.id, below!.id]);
        const updatedAbove = refreshed?.find((r) => r.id === above!.id);
        const updatedBelow = refreshed?.find((r) => r.id === below!.id);
        const a = (updatedAbove?.sort_order as number | null) ?? aboveSort;
        const b = (updatedBelow?.sort_order as number | null) ?? belowSort;
        const { error: e1 } = await supabase
          .from('tasks')
          .update({ sort_order: (a + b) / 2 })
          .eq('id', input.id);
        if (e1) throw e1;
        return;
      }

      let nextSort: number;
      if (aboveSort != null && belowSort != null) {
        nextSort = (aboveSort + belowSort) / 2;
      } else if (aboveSort != null) {
        nextSort = aboveSort + 1024;
      } else if (belowSort != null) {
        nextSort = belowSort / 2;
      } else {
        nextSort = 1024;
      }
      const { error } = await supabase
        .from('tasks')
        .update({ sort_order: nextSort })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      // Switch the user to manual sort so the reorder is actually visible.
      if (sortBy !== 'manual') setSortBy('manual');
    },
    onError: (e) => toast.error((e as Error).message || 'Sıralanmadı'),
  });

  // Time tracking — global active timer + start/stop mutations
  const { data: activeTimer } = useActiveTimeEntry();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  // Per-task aggregated time across all entries (chip on board card)
  const taskTimeTotals = useTaskTimeTotals(tasks.map((t) => t.id));

  // PRD §6.x — task templates (admin defines, anyone instantiates).
  // staleTime keeps it cached for 10 min so list isn't re-fetched on every render.
  const templates = useQuery({
    queryKey: ['task-templates'],
    staleTime: 10 * 60_000,
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
  // PRD §UX — label filter persisted in URL
  const [labelFilter, setLabelFilter] = useState<string | null>(searchParams.get('label'));
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (labelFilter) next.set('label', labelFilter);
    else next.delete('label');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelFilter]);
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) for (const l of t.labels ?? []) set.add(l);
    return Array.from(set).sort();
  }, [tasks]);

  // PRD §UX — sort within columns; persisted in URL so it survives reload + share
  type SortKey = 'deadline' | 'priority' | 'created' | 'manual';
  const [sortBy, setSortBy] = useState<SortKey>(
    (searchParams.get('sort') as SortKey) || 'deadline',
  );
  // PRD §UX — compact mode persisted in localStorage so the user's preference
  // survives across reloads/sessions without bloating the URL.
  const [compactBoard, setCompactBoard] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('reflect:v1:tasks:compactBoard') === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('reflect:v1:tasks:compactBoard', compactBoard ? '1' : '0'); }
    catch { /* localStorage disabled */ }
  }, [compactBoard]);
  // PRD §UX — quick "today only" toggle: deadline = today (any status)
  const [todayOnly, setTodayOnly] = useState(searchParams.get('today') === '1');
  // Sync today filter to URL so refresh/share-link preserves it (parity with
  // q/label/project filters).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (todayOnly) next.set('today', '1');
    else next.delete('today');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayOnly]);
  // PRD §UX — narrow board to one project (URL-persisted so share-link works)
  const [projectFilter, setProjectFilter] = useState<string>(searchParams.get('project') ?? '');
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (projectFilter) next.set('project', projectFilter);
    else next.delete('project');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter]);
  // Project list for the dropdown
  const projectsForFilter = useQuery({
    queryKey: ['projects-name-map'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .is('archived_at', null)
        .order('name');
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const projectsById = useMemo(
    () => new Map((projectsForFilter.data ?? []).map((p) => [p.id, p.name])),
    [projectsForFilter.data],
  );

  // PRD §6.3 — single key shortcuts: C compact, A mine-only (skip while typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (editing) return;
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setCompactBoard((v) => !v);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setMineOnly((v) => !v);
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setView((v) => (v === 'board' ? 'table' : 'board'));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    let out = tasks;
    if (labelFilter) out = out.filter((t) => (t.labels ?? []).includes(labelFilter));
    if (projectFilter === '__none__') out = out.filter((t) => !t.project_id);
    else if (projectFilter) out = out.filter((t) => t.project_id === projectFilter);
    if (todayOnly) {
      const today = bakuDateString();
      out = out.filter((t) => t.deadline === today);
    }
    if (search.trim()) {
      // PRD §UX — search spans title, description, labels, and project name
      // so users can find a task by any reasonable handle. AZ-fold both sides.
      const q = normalizeAz(search.trim());
      out = out.filter((t) => {
        const haystack = [
          t.title,
          t.description ?? '',
          ...(t.labels ?? []),
          projectsById.get(t.project_id ?? '') ?? '',
        ].join(' ');
        return normalizeAz(haystack).includes(q);
      });
    }
    return out;
  }, [tasks, search, labelFilter, projectFilter, todayOnly]);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (sortBy === 'deadline') next.delete('sort');
    else next.set('sort', sortBy);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);
  const sortTasks = (arr: Task[]): Task[] => {
    const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, normal: 2 };
    return [...arr].sort((a, b) => {
      // PRD §REQ-TASK-03 — when user explicitly reordered (sort_order set), respect
      // that ordering inside the column. Falls through to the chosen sortBy when
      // sort_order is null/equal.
      if (sortBy === 'manual') {
        const av = a.sort_order ?? Number.POSITIVE_INFINITY;
        const bv = b.sort_order ?? Number.POSITIVE_INFINITY;
        if (av !== bv) return av - bv;
      }
      if (sortBy === 'priority') {
        const ap = PRIORITY_ORDER[a.priority ?? 'normal'] ?? 3;
        const bp = PRIORITY_ORDER[b.priority ?? 'normal'] ?? 3;
        if (ap !== bp) return ap - bp;
      }
      if (sortBy === 'created') return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      // deadline (default): nulls last, ascending
      return (a.deadline ?? '￿').localeCompare(b.deadline ?? '￿');
    });
  };

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      idea: [], queued: [], active: [], review: [], expert: [], done: [], cancelled: [],
    };
    for (const t of filtered) map[t.status].push(t);
    for (const k of Object.keys(map) as TaskStatus[]) map[k] = sortTasks(map[k]);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortBy]);

  // US-TASK-06 — time-grouped personal view computed data
  const groupedByTime = useMemo(() => {
    const map = {} as Record<TimeGroup, Task[]>;
    for (const g of TIME_GROUP_ORDER) map[g] = [];
    const todayBaku = bakuDateString();
    for (const t of filtered) {
      if (t.status === 'cancelled') continue;
      // PRD US-TASK-06 — keep today's done items so user can untick mistakes.
      // archived_at is auto-stamped (0006_task_lifecycle); compare in Baku TZ.
      // Treat optimistic state (status=done but archived_at not yet stamped)
      // as "today" so a freshly-ticked task doesn't flicker out of the list
      // during the ~150-400ms window before the realtime UPDATE delivers
      // the trigger-stamped value.
      if (t.status === 'done') {
        const archivedDay = t.archived_at ? bakuDateString(new Date(t.archived_at)) : null;
        if (archivedDay !== null && archivedDay !== todayBaku) continue;
      }
      map[taskTimeGroup(t)].push(t);
    }
    return map;
  }, [filtered]);

  // PRD §UX — bubble overdue count to the page meta so it's visible from the header
  // even when the board is scrolled. Matches the red border treatment on cards.
  const todayIso = bakuDateString();
  const overdueCount = filtered.filter(
    (t) => t.deadline && t.deadline < todayIso && t.status !== 'done' && t.status !== 'cancelled',
  ).length;
  // PRD §UX — total estimated hours across visible open tasks (for at-a-glance load).
  // DB stores duration_unit as 'hours' | 'days' (TaskCreateModal options). Previous
  // version compared 'day'/'week' which never matched, silently under-counting
  // day-typed tasks by 8× and ignoring legacy 'week' rows.
  const totalEstimateH = filtered.reduce((sum, t) => {
    if (t.status === 'done' || t.status === 'cancelled') return sum;
    const d = t.estimated_duration;
    if (d == null) return sum;
    const unit = (t as { duration_unit?: string }).duration_unit ?? 'hours';
    const h = unit === 'days' ? d * 8 : unit === 'weeks' ? d * 40 : d;
    return sum + h;
  }, 0);
  const meta = `${filtered.length} cəmi · ${grouped.active.length} icrada · ${grouped.review.length} yoxlamada${
    totalEstimateH > 0 ? ` · ~${Math.round(totalEstimateH)}s` : ''
  }${
    overdueCount > 0 ? ` · ⚠ ${overdueCount} gecikmiş` : ''
  }`;

  return (
    <>
      <PageHead
        meta={meta}
        title="Tapşırıqlar"
        actions={
          <>
            <div className="relative">
              <input
                ref={searchInputRef}
                className="input max-w-[240px] pr-7"
                placeholder="Axtar… (/)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // PRD §UX — Esc clears + blurs (cancel-out pattern)
                  if (e.key === 'Escape' && search) {
                    e.preventDefault();
                    setSearch('');
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              {/* PRD §UX — visible × to clear without keyboard */}
              {search ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
                  onClick={() => setSearch('')}
                  aria-label="Axtarışı təmizlə"
                  tabIndex={-1}
                >
                  ×
                </button>
              ) : null}
            </div>
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
                  `tasks-${bakuDateString()}`,
                  ['Başlıq', 'Status', 'Prioritet', 'Etiketlər', 'Layihə', 'Deadline', 'İcraçılar', 'Yaradıldı'],
                  filtered.map((t) => ({
                    'Başlıq': t.title,
                    'Status': t.status,
                    'Prioritet': t.priority ?? '',
                    'Etiketlər': (t.labels ?? []).join('; '),
                    'Layihə': projectsById.get(t.project_id ?? '') ?? '',
                    'Deadline': t.deadline ?? '',
                    'İcraçılar': (t.assignee_ids ?? [])
                      .map((id) => profileById[id]?.full_name ?? id.slice(0, 8))
                      .join('; '),
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

      <div
        className="flex gap-2 mb-4 flex-wrap items-center"
        style={{
          // PRD §UX — keep filters within reach when scrolling long boards
          position: 'sticky',
          top: 0,
          background: 'var(--canvas)',
          zIndex: 10,
          paddingTop: 8,
          marginTop: -8,
        }}
      >
        <select
          className="input"
          style={{ maxWidth: 160, height: 32, fontSize: 12 }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          aria-label="Sıralama"
        >
          <option value="deadline">↑ Son tarix</option>
          <option value="priority">Prioritet</option>
          <option value="created">Yenilər əvvəl</option>
          <option value="manual">Manuel sıralama</option>
        </select>
        {/* PRD §UX — "Bu gün" quick filter (deadline = today) */}
        <button
          type="button"
          className="chip"
          style={{
            background: todayOnly ? 'var(--brand-action)' : undefined,
            color: todayOnly ? 'var(--ink)' : undefined,
            fontWeight: todayOnly ? 600 : 400,
          }}
          onClick={() => setTodayOnly((v) => !v)}
          aria-pressed={todayOnly}
          title="Yalnız bu günə düşənləri göstər"
        >
          {todayOnly ? '✓ Bu gün' : 'Bu gün'}
        </button>
        {/* PRD §UX — narrow to a single project */}
        {(projectsForFilter.data ?? []).length > 0 ? (
          <select
            className="input"
            style={{ maxWidth: 200, height: 32, fontSize: 12 }}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Layihəyə görə süz"
          >
            <option value="">Bütün layihələr</option>
            <option value="__none__">— layihəsiz —</option>
            {(projectsForFilter.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
        {/* PRD §REQ-PROJ-04 — quick "Portfolio" chip filters to label=portfolio
            (auto-tagged when project closeout creates prep tasks). */}
        <button
          type="button"
          className="chip"
          style={{
            background: labelFilter === 'portfolio' ? 'var(--brand-action)' : undefined,
            color: labelFilter === 'portfolio' ? 'var(--ink)' : undefined,
            fontWeight: labelFilter === 'portfolio' ? 600 : 400,
          }}
          onClick={() => setLabelFilter(labelFilter === 'portfolio' ? null : 'portfolio')}
          aria-pressed={labelFilter === 'portfolio'}
          title="Portfolio prep tapşırıqları (layihə bağlanarkən avtomatik yaradılır)"
        >
          {labelFilter === 'portfolio' ? '✓ ' : ''}🎨 Portfolio
        </button>
        {/* PRD §UX — compact mode hides done/cancelled columns on board view */}
        {view === 'board' ? (
          <button
            type="button"
            className="chip"
            style={{
              background: compactBoard ? 'var(--brand-action)' : undefined,
              color: compactBoard ? 'var(--ink)' : undefined,
              fontWeight: compactBoard ? 600 : 400,
            }}
            onClick={() => setCompactBoard((v) => !v)}
            aria-pressed={compactBoard}
            title="Tamamlanmış / ləğv edilmiş sütunları gizlət"
          >
            {compactBoard ? '✓ Yığcam' : 'Yığcam'}
          </button>
        ) : null}
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
            {allLabels.map((l) => {
              // PRD §UX — show per-label task count so filter chips signal volume
              const count = tasks.filter((t) => (t.labels ?? []).includes(l)).length;
              return (
                <button
                  key={l}
                  className={`chip ${labelFilter === l ? 'chip-brand' : ''}`}
                  onClick={() => setLabelFilter(labelFilter === l ? null : l)}
                >
                  # {l}
                  <span style={{ marginLeft: 4, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
        {/* PRD §UX — single clear-all when any filter is active */}
        {(search || labelFilter || projectFilter || todayOnly) ? (
          <>
            <span style={{ width: 1, background: 'var(--line)', margin: '0 4px' }} />
            <button
              type="button"
              className="chip"
              style={{ fontSize: 11, color: 'var(--text-muted)' }}
              onClick={() => { setSearch(''); setLabelFilter(null); setProjectFilter(''); setTodayOnly(false); }}
              title="Bütün filtrləri təmizlə"
            >
              ✕ Təmizlə
            </button>
          </>
        ) : null}
      </div>

      {/* PRD §UX — assignee filter from URL banner with one-click clear */}
      {initialUrlAssignee ? (
        <div
          className="card mb-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--brand-glow-sm)' }}
        >
          <span className="text-meta" style={{ color: 'var(--brand-text)' }}>
            Yalnız bir istifadəçinin tapşırıqları göstərilir
          </span>
          <button
            type="button"
            className="chip"
            style={{ fontSize: 11 }}
            onClick={() => {
              // SPA: just drop the param. useSearchParams hook re-renders the
              // page, the useTasks query re-keys without assignee filter, and
              // no full reload destroys modal/draft state.
              const next = new URLSearchParams(searchParams);
              next.delete('assignee');
              setSearchParams(next, { replace: true });
            }}
          >
            ✕ Bütün istifadəçilər
          </button>
        </div>
      ) : null}
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
      ) : filtered.length === 0 ? (
        // PRD §UX — filters silenced all rows; tell user how to undo
        <EmptyState
          title="Filtrə uyğun tapşırıq yoxdur"
          body="Axtarış, etiket və ya 'Bu gün' filtrini ləğv et."
          cta={
            <button
              type="button"
              className="btn-outline"
              onClick={() => { setSearch(''); setLabelFilter(null); setTodayOnly(false); setProjectFilter(''); }}
            >
              ✕ Filtrləri təmizlə
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
                        checked={bulkMode ? selectedIds.has(t.id) : t.status === 'done'}
                        onChange={() => {
                          if (bulkMode) { toggleSelected(t.id); return; }
                          // PRD US-TASK-06 — unticking a done task reverts it to
                          // 'active' so accidental completion is recoverable.
                          moveTask(t.id, t.status === 'done' ? 'active' : 'done', t.status);
                        }}
                        style={{ accentColor: 'var(--brand-action)', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                        aria-label={bulkMode ? `${t.title} seç` : (t.status === 'done' ? `${t.title} bərpa et` : `${t.title} tamamlandı`)}
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
                      {/* PRD §US-TASK-06 / §6.6 — inline status dropdown.
                          Sized to meet WCAG 2.5.5 minimum target (24×24);
                          previous 11px font / 0.5 padding fell below the
                          touch-target floor on mobile. */}
                      <select
                        aria-label="Status dəyiş"
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value as TaskStatus, t.status)}
                        className="text-meta rounded border-0"
                        style={{
                          background: 'var(--surface-raised)',
                          color: TASK_STATUS_TONE[t.status].text,
                          flexShrink: 0,
                          fontSize: 12,
                          minHeight: 28,
                          padding: '4px 10px',
                        }}
                      >
                        {TASK_STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
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
          {TASK_STATUS_ORDER.filter((s) => !compactBoard || (s !== 'done' && s !== 'cancelled')).map((s) => {
            const isToday = s === 'active';
            const tone = TASK_STATUS_TONE[s];
            // PRD §UX — sum estimated hours per column so user sees workload per stage.
            // duration_unit is 'hours' | 'days' from TaskCreateModal; 'weeks' kept as
            // legacy fallback for any older rows.
            const totalHours = grouped[s].reduce((sum, t) => {
              const d = t.estimated_duration;
              if (d == null) return sum;
              const unit = (t as { duration_unit?: string }).duration_unit ?? 'hours';
              const h = unit === 'days' ? d * 8 : unit === 'weeks' ? d * 40 : d;
              return sum + h;
            }, 0);
            return (
              <div
                key={s}
                className="rounded-card p-3 transition-colors"
                style={{
                  background: !isTouch && dragOverColumn === s
                    ? 'var(--brand-glow-sm)'
                    : isToday ? 'var(--ink)' : 'transparent',
                  color: isToday ? 'var(--canvas)' : 'inherit',
                  border: !isTouch && dragOverColumn === s
                    ? '2px dashed var(--brand-action)'
                    : isToday ? 'none' : isTouch ? '1px solid var(--line)' : '1px dashed var(--line)',
                  minHeight: 320,
                }}
                onDragOver={(e) => { e.preventDefault(); if (dragOverColumn !== s) setDragOverColumn(s); }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => {
                  setDragOverColumn(null);
                  const raw = e.dataTransfer.getData('text/plain');
                  if (!raw) return;
                  const { id, from } = JSON.parse(raw) as { id: string; from: TaskStatus };
                  if (from !== s) {
                    // Cross-column drop: change status; reorder to bottom of new column.
                    moveTask(id, s, from);
                    reorderTask.mutate({ id, column: s, targetId: null });
                  } else {
                    // PRD §REQ-TASK-03 — same-column drop on the empty area:
                    // place at the bottom. Card-level drops (above a specific
                    // sibling) are handled by the article's own onDrop.
                    reorderTask.mutate({ id, column: s, targetId: null });
                  }
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
                  {totalHours > 0 ? (
                    <span style={{ marginLeft: 6, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                      · {Math.round(totalHours)}s
                    </span>
                  ) : null}
                </h3>
                {/* PRD US-TASK-01 — inline quick-add: type title + Enter creates
                    task in this column. Modal popup remains the "full create"
                    path; this is the 1-keystroke shortcut. */}
                <QuickAddInline
                  status={s}
                  // '__none__' is the layihəsiz filter sentinel — don't pass
                  // it as a project_id (would FK-fail on insert). undefined
                  // means "no project", which is correct for the sentinel.
                  projectId={projectFilter && projectFilter !== '__none__' ? projectFilter : undefined}
                  myId={profile?.id ?? undefined}
                  isToday={isToday}
                />
                <div className="space-y-2" role="list" aria-label={TASK_STATUS_LABEL[s]}>
                  {grouped[s].map((t) => {
                    // PRD §UX — surface overdue tasks visually on the board so they
                    // can't be missed when scrolling through a column. Skip done/cancelled.
                    const isOverdue = !!t.deadline
                      && t.status !== 'done' && t.status !== 'cancelled'
                      && t.deadline < bakuDateString();
                    // PRD US-TASK-03 — "card is grayed visually" once cancelled.
                    const isCancelled = t.status === 'cancelled';
                    return (
                    <article
                      key={t.id}
                      draggable
                      tabIndex={0}
                      role="listitem"
                      data-task-card="1"
                      data-task-id={t.id}
                      data-task-status={t.status}
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ id: t.id, from: t.status }),
                        )
                      }
                      // PRD §REQ-TASK-03 — card-level drop = "place above this card".
                      // stopPropagation prevents the column-level onDrop from also
                      // firing and resetting the target to "bottom of column".
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverColumn(null);
                        const raw = e.dataTransfer.getData('text/plain');
                        if (!raw) return;
                        const { id: dragId, from } = JSON.parse(raw) as { id: string; from: TaskStatus };
                        if (dragId === t.id) return;
                        if (from !== s) moveTask(dragId, s, from);
                        reorderTask.mutate({ id: dragId, column: s, targetId: t.id });
                      }}
                      // PRD §6.6 / REQ-TASK-03 — keyboard navigation on the board.
                      // ↑/↓ moves focus within column, ←/→ jumps to adjacent column
                      // (same row index), Enter opens comments, Shift+←/→ moves the
                      // card across status columns. Skips when modifier is meta/ctrl.
                      onKeyDown={(e) => {
                        if (e.metaKey || e.ctrlKey || e.altKey) return;
                        const cols = TASK_STATUS_ORDER;
                        const colIdx = cols.indexOf(s);
                        const rowIdx = grouped[s].findIndex((x) => x.id === t.id);
                        const focusCard = (status: TaskStatus, idx: number) => {
                          const list = grouped[status];
                          if (list.length === 0) return;
                          const target = list[Math.max(0, Math.min(idx, list.length - 1))];
                          requestAnimationFrame(() => {
                            const el = document.querySelector(`[data-task-card="1"][data-task-id="${target.id}"]`) as HTMLElement | null;
                            el?.focus();
                          });
                        };
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setCommenting({ id: t.id, title: t.title });
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          focusCard(s, rowIdx + 1);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          focusCard(s, rowIdx - 1);
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          if (e.shiftKey) {
                            const next = cols[colIdx + 1];
                            if (next) moveTask(t.id, next, s);
                          } else {
                            const next = cols[colIdx + 1];
                            if (next) focusCard(next, rowIdx);
                          }
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          if (e.shiftKey) {
                            const prev = cols[colIdx - 1];
                            if (prev) moveTask(t.id, prev, s);
                          } else {
                            const prev = cols[colIdx - 1];
                            if (prev) focusCard(prev, rowIdx);
                          }
                        }
                      }}
                      // PRD §6.6 a11y — explicit ring color visible on both
                      // light surface and the dark "BU GÜN" column background.
                      className="rounded-card p-3 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--brand-action)]"
                      style={{
                        opacity: isCancelled ? 0.55 : 1,
                        textDecoration: isCancelled ? 'line-through' : undefined,
                        background: isToday ? 'var(--card-dark-bg)' : 'var(--surface)',
                        border: `1px solid ${
                          isOverdue
                            ? 'var(--error)'
                            : isToday ? 'var(--card-dark-border)' : 'var(--line)'
                        }`,
                        boxShadow: isOverdue ? '0 0 0 1px var(--error) inset' : undefined,
                        // PRD §UX — 3px priority bar on the left edge of each card
                        borderLeft: t.priority === 'high'
                          ? '3px solid var(--error-deep, #b3261e)'
                          : t.priority === 'medium'
                          ? '3px solid var(--warning, #c47d00)'
                          : t.priority === 'low'
                          ? '3px solid var(--success-deep, #16794a)'
                          : undefined,
                      }}
                    >
                      {/* PRD §REQ-TASK-01 — parent breadcrumb for subtasks
                          (task_level > 0). When the parent is out of the
                          current RLS scope (e.g. assigned to others), fall
                          back to "Alt-tapşırıq" so the user still knows this
                          card has a parent. */}
                      {t.parent_task_id ? (
                        <div
                          className="text-meta truncate mb-1"
                          style={{
                            color: isToday ? 'var(--text-faint)' : 'var(--text-muted)',
                            fontSize: 10,
                            opacity: 0.7,
                          }}
                          title={
                            parentTitleById.has(t.parent_task_id)
                              ? `Ana tapşırıq: ${parentTitleById.get(t.parent_task_id) ?? ''}`
                              : 'Ana tapşırıq görünmür'
                          }
                        >
                          ↳ {parentTitleById.get(t.parent_task_id) ?? 'Alt-tapşırıq'}
                        </div>
                      ) : null}
                      <div
                        className="font-medium cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setCommenting({ id: t.id, title: t.title }); }}
                        title={(() => {
                          // PRD §UX — tooltip combines description (if any) + created age
                          const parts: string[] = [];
                          if (t.description) parts.push(t.description);
                          if (t.created_at) parts.push(`Yaradılıb: ${new Date(t.created_at).toLocaleDateString('az-AZ')}`);
                          if (t.priority) parts.push(`Prioritet: ${t.priority}`);
                          if (t.parent_task_id && parentTitleById.has(t.parent_task_id)) {
                            parts.push(`Ana: ${parentTitleById.get(t.parent_task_id)}`);
                          }
                          return parts.length ? parts.join('\n\n') : undefined;
                        })()}
                      >
                        {/* PRD §UX — priority emoji prefix (already shown as left border in batch 72) */}
                        {t.priority === 'high' ? <span aria-hidden style={{ marginRight: 4 }}>🔴</span> : null}
                        {/* PRD §REQ-TASK-09 — purple E badge for expertise subtasks
                            (matches the "expert" status dot hex #7C5CD9 in labels.ts) */}
                        {t.is_expertise_subtask ? (
                          <span
                            aria-hidden
                            className="text-tiny inline-flex items-center justify-center mr-1"
                            style={{
                              width: 14, height: 14, borderRadius: 3,
                              background: '#7C5CD9', color: 'white',
                              fontWeight: 700, fontSize: 9, verticalAlign: 'middle',
                            }}
                            title="Ekspertiza alt-tapşırığı"
                          >E</span>
                        ) : null}
                        {t.title}
                      </div>
                      {/* Assignee avatars — PRD §6.8 */}
                      {t.assignee_ids.length > 0 && (
                        <div className="mt-1">
                          <AvatarGroup people={assigneePeople(t.assignee_ids)} size={20} />
                        </div>
                      )}
                      {/* PRD §6.x — priority + label chips on board card */}
                      {(t.priority || (t.labels ?? []).length > 0 || (taskTimeTotals.data?.get(t.id) ?? 0) > 0) ? (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {/* Total tracked time chip */}
                          {(taskTimeTotals.data?.get(t.id) ?? 0) > 0 ? (
                            <span
                              className="chip"
                              style={{
                                background: 'var(--brand-glow-sm)',
                                color: 'var(--brand-text)',
                                fontSize: 9,
                                padding: '0 5px',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                              title={`Toplu izlənmiş vaxt`}
                            >
                              ⏱ {formatDuration(taskTimeTotals.data?.get(t.id) ?? 0)}
                            </span>
                          ) : null}
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
                          {/* PRD §6.6 — keyboard / touch alternative to drag-drop.
                              HTML5 draggable doesn't fire on iOS/Android; this
                              <select> is the primary status-change mechanism for
                              tap-only users. Sized ≥32px tap target. */}
                          <select
                            aria-label="Status dəyiş (toxunma cihazları üçün)"
                            title="Statusu dəyişdir — toxunma cihazları üçün sürükləməyə alternativ"
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
                              fontSize: 12,
                              padding: '4px 6px',
                              minHeight: 32,
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
                          {/* Time tracking — start/stop timer for this task */}
                          {activeTimer?.task_id === t.id ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); stopTimer.mutate(); }}
                              disabled={stopTimer.isPending}
                              className="text-meta opacity-100"
                              style={{ color: 'var(--brand-action)' }}
                              aria-label="Timer-i dayandır"
                              title="Timer-i dayandır"
                            >
                              ⏹
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); startTimer.mutate(t.id); }}
                              disabled={startTimer.isPending}
                              className="text-meta opacity-60 hover:opacity-100"
                              style={{ color: isToday ? 'var(--text-faint)' : 'var(--text-muted)' }}
                              aria-label="Timer başlat"
                              title="Timer başlat"
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                    );
                  })}
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
              {['Tapşırıq', 'Status', 'Prioritet', 'Etiketlər', 'İcraçı', 'Deadline', 'İzlənmiş', ''].map((h, i) => (
                <th
                  key={i}
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
            {sortTasks(filtered).map((t) => {
              const trackedSec = taskTimeTotals.data?.get(t.id) ?? 0;
              return (
                <tr
                  key={t.id}
                  onClick={() => setCommenting({ id: t.id, title: t.title })}
                  className="hover:bg-surface-mist cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--line-soft)',
                    opacity: t.status === 'cancelled' ? 0.55 : 1,
                    textDecoration: t.status === 'cancelled' ? 'line-through' : undefined,
                  }}
                  title="Şərhləri aç"
                >
                  <td className="py-3 px-3">
                    {t.is_expertise_subtask ? (
                      <span
                        aria-hidden
                        className="inline-flex items-center justify-center mr-1"
                        style={{ width: 14, height: 14, borderRadius: 3, background: '#7C5CD9', color: 'white', fontWeight: 700, fontSize: 9 }}
                      >E</span>
                    ) : null}
                    {t.title}
                  </td>
                  <td className="py-3 px-3">{TASK_STATUS_LABEL[t.status]}</td>
                  <td className="py-3 px-3">
                    {t.priority ? (
                      <span
                        className="chip"
                        style={{
                          fontSize: 10,
                          background: t.priority === 'high' ? 'var(--error-aa, #8a1e18)' : t.priority === 'medium' ? 'var(--warning-aa, #8a5800)' : 'var(--surface-mist)',
                          color: t.priority === 'low' ? 'var(--text-muted)' : 'white',
                        }}
                      >
                        {t.priority === 'high' ? '↑' : t.priority === 'medium' ? '→' : '↓'} {t.priority}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="py-3 px-3">
                    {(t.labels ?? []).length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {(t.labels ?? []).slice(0, 3).map((l) => (
                          <span key={l} className="chip" style={{ background: 'var(--surface-mist)', fontSize: 10 }}>#{l}</span>
                        ))}
                        {(t.labels ?? []).length > 3 ? (
                          <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 10 }}>+{(t.labels ?? []).length - 3}</span>
                        ) : null}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
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
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {trackedSec > 0 ? formatDuration(trackedSec) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => cloneTask.mutate(t.id)}
                      disabled={cloneTask.isPending}
                      className="chip"
                      style={{ fontSize: 11 }}
                      title="Tapşırığı kopyala"
                      aria-label={`${t.title} kopyala`}
                    >
                      ⎘
                    </button>
                  </td>
                </tr>
              );
            })}
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
          // PRD §UX — pre-fill project from the active filter so the task
          // lands where the user is looking. '__none__' is the layihəsiz
          // sentinel; do NOT pass it as defaultProjectId (it isn't a real
          // uuid and would FK-fail on insert).
          defaultProjectId={projectFilter && projectFilter !== '__none__' ? projectFilter : undefined}
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
          // PRD §UX — key by taskId so switching between tasks (via the
          // subtask back-chip / "reflect:open-task" event) fully unmounts
          // and remounts the modal. Without this the inline-editor state
          // (title-being-edited, draft body, etc.) bleeds from one task
          // to the next.
          key={commenting.id}
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
        <BulkArchiveConfirmModal
          count={archivableCount}
          pending={bulkArchive.isPending}
          error={bulkArchive.error ? (bulkArchive.error as Error).message : null}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => bulkArchive.mutate()}
        />
      ) : null}
    </>
  );
}

// PRD US-TASK-01 — inline per-column quick-add: type title + Enter creates a
// task in that status with the current project filter as default. Modal-based
// "full create" remains for richer fields; this is the 1-keystroke path.
function QuickAddInline({
  status,
  projectId,
  myId,
  isToday,
}: {
  status: TaskStatus;
  projectId?: string;
  myId?: string;
  isToday: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (!t) return;
      const { error } = await supabase.from('tasks').insert({
        title: t,
        status,
        project_id: projectId ?? null,
        assignee_ids: myId ? [myId] : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle('');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toast.error((e as Error).message || 'Yaradılmadı'),
  });

  if (!open) {
    return (
      <button
        type="button"
        className="text-meta mb-2 w-full text-left px-2 py-1.5 rounded-btn"
        style={{
          background: 'transparent',
          color: isToday ? 'var(--canvas)' : 'var(--text-muted)',
          opacity: 0.65,
          border: '1px dashed var(--line)',
          fontSize: 11,
        }}
        onClick={() => setOpen(true)}
      >
        + Tez əlavə et
      </button>
    );
  }
  return (
    <form
      className="mb-2"
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
    >
      <input
        autoFocus
        className="input w-full"
        style={{ height: 30, fontSize: 12 }}
        placeholder="Başlıq · Enter ilə yarat, Esc bağla"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (!title.trim()) setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); setTitle(''); }
        }}
        disabled={create.isPending}
      />
    </form>
  );
}

// PRD §6.6 / US-TASK-07 — bulk-archive confirm dialog, parity with peer
// modals (CancelTaskModal, SubtaskBlockingModal): role=dialog + aria-modal,
// focus trapped, Esc to cancel.
function BulkArchiveConfirmModal({
  count,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  count: number;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-archive-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      // PRD §UX — don't let click-outside dismiss while the destructive
      // mutation is in flight; otherwise the modal closes mid-archive and
      // the user thinks they cancelled. Esc handler honours the same guard.
      onClick={() => { if (!pending) onCancel(); }}
    >
      <div
        ref={trapRef}
        className="bg-surface p-6 rounded-card w-[380px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bulk-archive-title" className="text-h2 mb-2">Toplu arxivləmə</h2>
        <p className="text-body mb-5" style={{ color: 'var(--text-muted)' }}>
          {count} ədəd <strong>Tamamlandı</strong> / <strong>Ləğv edildi</strong>{' '}
          tapşırığı arxivlənəcək. Tapşırıqlar lövhədən silinəcək; Arxiv bölməsindən bərpa edilə bilər.
        </p>
        {error ? (
          <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onCancel}>Ləğv et</button>
          <button className="btn-primary" disabled={pending} onClick={onConfirm}>
            {pending ? 'Arxivlənir…' : 'Arxivlə'}
          </button>
        </div>
      </div>
    </div>
  );
}
