import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { AvatarGroup } from '@/components/AvatarGroup';
import { isOpenChildrenError, useTasks, useUpdateTaskStatus } from '@/lib/hooks';
import { useSlashFocus } from '@/lib/useSlashFocus';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TaskCreateModal } from '@/components/TaskCreateModal';
import { CancelTaskModal } from '@/components/CancelTaskModal';
import { TaskCommentsModal } from '@/components/TaskCommentsModal';
import { TaskEditModal } from '@/components/TaskEditModal';
import { TaskCalendarView } from '@/components/TaskCalendarView';
import { TaskGanttView } from '@/components/TaskGanttView';
import { SkeletonList } from '@/components/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BulkActionBar } from '@/components/BulkActionBar';
import {
  TaskPersonalList,
  TIME_GROUP_ORDER,
  TIME_GROUP_COLOR,
  type TimeGroup,
  taskTimeGroup,
} from '@/components/TaskPersonalList';
import { downloadCsv } from '@/lib/csv';
import { toast } from '@/components/Toast';
import { formatDuration, useActiveTimeEntry, useStartTimer, useStopTimer, useTaskTimeTotals } from '@/lib/useTimeTracking';
import { todayInBaku, endOfWeekInBaku, daysFromTodayInBaku, currentMonthInBaku } from '@/lib/time';
import { onOpenTask } from '@/lib/events';
import { durationToHours, formatEstimatedDuration } from '@/lib/duration';
import { filterTasks } from '@/lib/taskFilters';
import { sortTasks as sortTasksPure, type TaskSortKey } from '@/lib/taskSort';

// US-TASK-06 — deadline-based groups for the "Mənim" view. The labels +
// colour + bucketing logic now live with TaskPersonalList; the table view
// still uses TIME_GROUP_COLOR to colour the deadline cell, imported below.

// Tunables — keep magic numbers out of the render path. Duration helpers
// (HOURS_PER_*, normalizeDurationUnit, durationToHours, formatEstimatedDuration)
// now live in src/lib/duration.ts so the conversion is unit-testable.
const LOOKUP_STALE_MS = 5 * 60_000; // 5 min — applied to profile/project/template lookups

export function TasksPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  // Per-render comparators (see TimeGroup note above) — fresh on each render
  // so day-rollover, focus-refetch, etc. always re-bucket against "now".
  // PRD §FIN-09 — date math anchored to Asia/Baku, not the browser's UTC.
  const todayStr = todayInBaku();
  const endOfWeekStr = endOfWeekInBaku();
  // Read URL params via useSearchParams so router updates rerender (don't snapshot window.location).
  const [searchParams, setSearchParams] = useSearchParams();
  // Design spec §8.3: four view toggles — Lövhə · Cədvəl · Təqvim · Gantt.
  // Persisted in URL so refresh + share-link land on the same view.
  const [view, setView] = useState<'board' | 'table' | 'calendar' | 'gantt'>(() => {
    const v = searchParams.get('view');
    return v === 'table' || v === 'calendar' || v === 'gantt' ? v : 'board';
  });
  // Calendar month being viewed (year + 0-based month). Defaults to current
  // Bakı month so users right after Bakı midnight don't see "December" while
  // their wall clock already reads January.
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(
    () => currentMonthInBaku(),
  );
  // Gantt window: ISO date of the left edge (axis spans 42 days). Anchored
  // to Bakı time so "today − 7" doesn't drift across midnight.
  const [ganttStart, setGanttStart] = useState<string>(() => daysFromTodayInBaku(-7));
  // Design spec §8.3: "Empty Tamamlandı stub: '+ N daha' — clicks expand archived".
  const [expandedArchive, setExpandedArchive] = useState(false);
  // PRD §6.6 — screen reader announcement after status moves so DnD users
  // who can't see the column highlight still hear what happened.
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  // PRD §UX — ?assignee=<uuid> deep-links from Roster to "tasks for this person"
  const urlAssignee = searchParams.get('assignee');
  // Persisted in URL (?mine=1) for share-link parity with other filters.
  const [mineOnly, setMineOnly] = useState<boolean>(() => searchParams.get('mine') === '1');
  // PRD §UX — drag-over column highlight (board view DnD feedback)
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  // Source-card dim during drag so the user can tell which card is being
  // moved (browser ghost-image follows the cursor, but the source stays solid).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // URL assignee takes precedence over mineOnly so Roster click always lands on that user
  const filterAssignee = urlAssignee || (mineOnly && profile?.id ? profile.id : null);
  const { data: tasks = [], isLoading } = useTasks(
    filterAssignee ? { assigneeId: filterAssignee } : undefined,
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
    staleTime: LOOKUP_STALE_MS,
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

  // PRD §REQ-TASK — subtask navigation: TaskCommentsModal dispatches an
  // open-task event when the user clicks a subtask or the parent back-chip;
  // Tasks.tsx (modal owner) swaps the open task without re-rendering tree.
  // Event name + payload shape live in src/lib/events.ts.
  useEffect(() => onOpenTask((detail) => setCommenting(detail)), []);
  // Deep-link consumer for ?focus=<task-id>. TaskCommentsModal builds links
  // like /tapşırıqlar?focus=<id>; without this effect those links land here
  // but the modal never opens. The param is cleared after first consumption
  // so a reload doesn't re-open the same task.
  const focusConsumedRef = useRef(false);
  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId || focusConsumedRef.current) return;
    const t = tasks.find((x) => x.id === focusId);
    if (!t) return; // tasks still loading or focus id doesn't match current scope
    focusConsumedRef.current = true;
    setCommenting({ id: t.id, title: t.title });
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [tasks, searchParams, setSearchParams]);
  const [editing, setEditing] = useState<Task | null>(null);
  // PRD §6.x — bulk action mode for the table/list view. The reassign
  // popover / target-id state lives inside BulkActionBar; resetting bulk
  // mode unmounts the bar which discards that local state automatically.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // useCallback so dependent effects can list it honestly. Inner setters
  // are stable; empty deps are correct.
  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  // Personal-view: checking the box on a task triggers moveTask → done.
  // The DB round-trip + refetch isn't instant, so React would un-check the
  // controlled checkbox before the row disappears, producing a tick → un-tick
  // → vanish flicker. Tracking "I just checked this" locally keeps the tick
  // visible until the row falls out of groupedByTime entirely.
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const visible = new Set(tasks.map((t) => t.id));
    setCompletingIds((s) => {
      if (s.size === 0) return s;
      let changed = false;
      const next = new Set<string>();
      for (const id of s) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : s;
    });
  }, [tasks]);

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
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      exitBulkMode();
      if (count) toast.success(`${count} tapşırıq yenidən təyin edildi`);
    },
    onError: (e) => toast.error((e as Error).message),
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
        // Schema has no DEFAULT for created_by — must be set explicitly,
        // otherwise the row's creator lineage is null.
        created_by: profile?.id ?? null,
        // parent_task_id intentionally not copied — clone is a top-level task
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tapşırıq klonlandı');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  // Persist search filter in URL so refresh / share-link preserves it.
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  // PRD §6.3 / §UX — Slack/GitHub-style "/" jumps to search box
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchInputRef);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set('q', search);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [search, searchParams, setSearchParams]);

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
    // Surface failure via toast so ConfirmDialog stays a pure yes/no primitive.
    // Matches bulkArchiveSelected's error pattern.
    onError: (e) => toast.error((e as Error).message),
  });

  function moveTask(id: string, status: TaskStatus, from?: TaskStatus) {
    if (status === 'cancelled') {
      const t = tasks.find((x) => x.id === id);
      setCancelling({ id, title: t?.title ?? '' });
      return;
    }
    const task = tasks.find((x) => x.id === id);
    update.mutate(
      { id, status, from },
      {
        onSuccess: () => {
          // Mirror the column-highlight visual feedback with an aria-live
          // message for keyboard / screen-reader users.
          const title = task?.title ?? 'Tapşırıq';
          setStatusAnnouncement(`${title}: ${TASK_STATUS_LABEL[status]}`);
        },
        onError: (e) => {
          // Subtask-blocker is handled with its own modal flow; every other
          // error (RLS denial, network, validation) needs to surface as a
          // toast so the user knows the card didn't move.
          if (status === 'done' && isOpenChildrenError(e)) {
            setBlocker({ id, from });
            return;
          }
          toast.error((e as Error).message);
        },
      },
    );
  }

  // Time tracking — global active timer + start/stop mutations
  const { data: activeTimer } = useActiveTimeEntry();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  // Per-task aggregated time across all entries (chip on board card).
  // Memoize the id list so identity is stable across renders where `tasks`
  // didn't change — keeps the hook's internal cache key check on the fast path.
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const taskTimeTotals = useTaskTimeTotals(taskIds);

  // Design spec §8.3 — "+ N daha" expand archived in Tamamlandı column.
  // Count is cheap (head-only); rows are loaded lazily on expand.
  const archivedDoneCount = useQuery({
    queryKey: ['tasks', 'archived-done-count', filterAssignee],
    queryFn: async () => {
      let q = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'done')
        .not('archived_at', 'is', null);
      if (filterAssignee) q = q.contains('assignee_ids', [filterAssignee]);
      const { count } = await q;
      return count ?? 0;
    },
  });
  const archivedDone = useQuery({
    queryKey: ['tasks', 'archived-done-rows', filterAssignee],
    enabled: expandedArchive,
    queryFn: async (): Promise<Task[]> => {
      let q = supabase
        .from('tasks')
        .select('*')
        .eq('status', 'done')
        .not('archived_at', 'is', null);
      if (filterAssignee) q = q.contains('assignee_ids', [filterAssignee]);
      const { data, error } = await q.order('archived_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // PRD §6.x — task templates (admin defines, anyone instantiates).
  // Templates rarely change at runtime — match the 5-min staleTime used
  // for the profile / project lookups so we don't refetch every focus.
  const templates = useQuery({
    queryKey: ['task-templates'],
    staleTime: LOOKUP_STALE_MS,
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
        // Same created_by note as cloneTask above — schema has no DEFAULT.
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      return tpl.name;
    },
    // Toast confirms the create so a stray click on the dropdown doesn't
    // silently spawn a task. The new task lands in queued + (kopya-less)
    // — user can archive from the toast-adjacent UI if they didn't mean it.
    onSuccess: (templateName) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`"${templateName}" şablonundan tapşırıq yaradıldı`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // PRD §6.x — label filter (chip row above the kanban)
  // PRD §UX — label filter persisted in URL
  const [labelFilter, setLabelFilter] = useState<string | null>(searchParams.get('label'));
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (labelFilter) next.set('label', labelFilter);
    else next.delete('label');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [labelFilter, searchParams, setSearchParams]);
  // Single pass over tasks to build both the sorted label list AND the
  // per-label counts. The previous code recomputed `filter().length` per
  // chip per render — O(L × N) every paint, with L labels and N tasks.
  const { allLabels, labelCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const l of t.labels ?? []) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    return {
      allLabels: Array.from(counts.keys()).sort(),
      labelCounts: counts,
    };
  }, [tasks]);

  // PRD §UX — sort within columns; persisted in URL so it survives reload + share.
  // TaskSortKey is exported from src/lib/taskSort.ts so the state type and
  // the helper stay in lock-step.
  const [sortBy, setSortBy] = useState<TaskSortKey>(
    (searchParams.get('sort') as TaskSortKey) || 'deadline',
  );
  // PRD §UX — compact mode persisted in localStorage so the user's preference
  // survives across reloads/sessions without bloating the URL.
  const [compactBoard, setCompactBoard] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('reflect.tasks.compactBoard') === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('reflect.tasks.compactBoard', compactBoard ? '1' : '0'); }
    catch { /* localStorage disabled */ }
  }, [compactBoard]);
  // PRD §UX — quick "today only" toggle: deadline = today (any status)
  const [todayOnly, setTodayOnly] = useState(false);
  // PRD §UX — narrow board to one project (URL-persisted so share-link works)
  const [projectFilter, setProjectFilter] = useState<string>(searchParams.get('project') ?? '');
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (projectFilter) next.set('project', projectFilter);
    else next.delete('project');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [projectFilter, searchParams, setSearchParams]);
  // URL sync — view + mineOnly. Same pattern as q/label/project above.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (view === 'board') next.delete('view');
    else next.set('view', view);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [view, searchParams, setSearchParams]);
  // Reverse direction: browser back/forward changes searchParams, which must
  // reflect back into state. Without this, ?view=board in the address bar
  // would not flip the rendered view after a back-button press.
  useEffect(() => {
    const v = searchParams.get('view');
    const fromUrl: 'board' | 'table' | 'calendar' | 'gantt' =
      v === 'table' || v === 'calendar' || v === 'gantt' ? v : 'board';
    setView((cur) => (cur === fromUrl ? cur : fromUrl));
    const m = searchParams.get('mine') === '1';
    setMineOnly((cur) => (cur === m ? cur : m));
  }, [searchParams]);
  // Bulk mode only renders in the table view — auto-exit when switching away
  // so the floating action bar doesn't ghost in other views. exitBulkMode is
  // useCallback above; bulkMode is included so the effect resets cleanly if
  // it ever becomes true outside the table view (defensive).
  useEffect(() => {
    if (view !== 'table' && bulkMode) exitBulkMode();
  }, [view, bulkMode, exitBulkMode]);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (mineOnly) next.set('mine', '1');
    else next.delete('mine');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [mineOnly, searchParams, setSearchParams]);
  // Fetch ALL projects (active + archived) so board/table can resolve a task's
  // project name even after that project is archived. The dropdown below
  // filters this client-side to active-only — archived projects aren't
  // useful filter targets but still need a name in the lookup map.
  const projectsForFilter = useQuery({
    queryKey: ['projects-name-phase-map'],
    staleTime: LOOKUP_STALE_MS,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, phases, archived_at')
        .order('name');
      return (data ?? []) as Array<{ id: string; name: string; phases: string[] | null; archived_at: string | null }>;
    },
  });
  const activeProjects = useMemo(
    () => (projectsForFilter.data ?? []).filter((p) => !p.archived_at),
    [projectsForFilter.data],
  );
  const projectById = useMemo(
    () => Object.fromEntries((projectsForFilter.data ?? []).map((p) => [p.id, p])),
    [projectsForFilter.data],
  );

  // PRD §6.3 — single key shortcuts: C compact (board only), A mine-only,
  // V cycle views, N new task. Listener registered once at mount; current
  // view read via ref so the empty-deps closure stays valid.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => {
    const VIEW_ORDER: Array<'board' | 'table' | 'calendar' | 'gantt'> =
      ['board', 'table', 'calendar', 'gantt'];
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (editing) return;
      if (e.key === 'c' || e.key === 'C') {
        // Compact mode is board-only — silently ignore on other views so
        // the shortcut doesn't flip hidden state.
        if (viewRef.current !== 'board') return;
        e.preventDefault();
        setCompactBoard((v) => !v);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setMineOnly((v) => !v);
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setView((v) => VIEW_ORDER[(VIEW_ORDER.indexOf(v) + 1) % VIEW_ORDER.length]);
      } else if (e.key === 'n' || e.key === 'N') {
        // Page-local "new task" — doesn't conflict with the global Cmd+N
        // since modifier keys early-exit at the top of this handler.
        e.preventDefault();
        setCreating(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(
    () => filterTasks(tasks, { labelFilter, projectFilter, todayOnly, todayStr, search }),
    [tasks, search, labelFilter, projectFilter, todayOnly, todayStr],
  );

  // Atomic clear-all. The per-filter URL-sync effects each read the same
  // pre-batch `searchParams` snapshot, so calling 4 setters and letting the
  // effects race produces a last-write-wins URL (some params survive). Doing
  // the URL update inline avoids the race — one setSearchParams call wipes
  // every param at once, then the individual effects no-op because state and
  // URL already agree.
  function clearAllFilters() {
    setSearch('');
    setLabelFilter(null);
    setProjectFilter('');
    setTodayOnly(false);
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('label');
    next.delete('project');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }
  // sortBy state + URL update in one place — same race-avoidance pattern as
  // clearAllFilters above. Saves a useEffect and the eslint suppression.
  function changeSort(next: TaskSortKey) {
    setSortBy(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'deadline') params.delete('sort');
    else params.set('sort', next);
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }
  // Bind the pure sortTasks helper to current sortBy so the dependent
  // useMemos can list one stable reference. The sort logic itself lives
  // in src/lib/taskSort.ts and is unit-tested there.
  const sortTasks = useCallback(
    (arr: Task[]): Task[] => sortTasksPure(arr, sortBy),
    [sortBy],
  );

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      idea: [], queued: [], active: [], review: [], expert: [], done: [], cancelled: [],
    };
    for (const t of filtered) map[t.status].push(t);
    for (const k of Object.keys(map) as TaskStatus[]) map[k] = sortTasks(map[k]);
    return map;
  }, [filtered, sortTasks]);

  // Table view obeys the same sort dropdown as the board (was raw insertion
  // order from useTasks before, ignoring user's sort preference).
  const sortedForTable = useMemo(
    () => sortTasks(filtered),
    [filtered, sortTasks],
  );

  // US-TASK-06 — time-grouped personal view computed data.
  // todayStr/endOfWeekStr are recomputed per render but are stable by value
  // within a day, so the memo still hits when only their identity changes.
  const groupedByTime = useMemo(() => {
    const map = {} as Record<TimeGroup, Task[]>;
    for (const g of TIME_GROUP_ORDER) map[g] = [];
    for (const t of filtered) {
      if (t.status === 'done' || t.status === 'cancelled') continue;
      map[taskTimeGroup(t, todayStr, endOfWeekStr)].push(t);
    }
    return map;
  }, [filtered, todayStr, endOfWeekStr]);

  // PRD §UX — bubble overdue count to the page meta so it's visible from the header
  // even when the board is scrolled. Matches the red border treatment on cards.
  const overdueCount = useMemo(
    () =>
      filtered.filter(
        (t) =>
          t.deadline &&
          t.deadline < todayStr &&
          t.status !== 'done' &&
          t.status !== 'cancelled',
      ).length,
    [filtered, todayStr],
  );
  // PRD §UX — total estimated hours across visible open tasks (for at-a-glance load)
  const totalEstimateH = useMemo(
    () =>
      filtered.reduce((sum, t) => {
        if (t.status === 'done' || t.status === 'cancelled') return sum;
        return t.estimated_duration == null
          ? sum
          : sum + durationToHours(t.estimated_duration, t.duration_unit);
      }, 0),
    [filtered],
  );
  const meta = `${filtered.length} cəmi · ${grouped.active.length} icrada · ${grouped.review.length} yoxlamada${
    totalEstimateH > 0 ? ` · ~${Math.round(totalEstimateH)}s` : ''
  }${
    overdueCount > 0 ? ` · ⚠ ${overdueCount} gecikmiş` : ''
  }`;

  return (
    <>
      {/* PRD §6.6 / designstyle4.md §6.6 — polite live region for status
          moves. Screen readers announce "<title>: <status>" without
          interrupting the user (assertive would). Visually hidden via
          the shared sr-only utility. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusAnnouncement}
      </div>
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
                // PRD §6.6 — placeholder isn't a label substitute under WCAG.
                aria-label="Tapşırıq axtarışı"
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
            {/* Matches the Seç button's active treatment: filled brand bg +
                ✓ prefix so the active state is unmissable, not just a border tint.
                Disabled while urlAssignee is set — that takes precedence in
                filterAssignee, so toggling Mənim would be a silent no-op.
                The banner above the board explains the override. */}
            <button
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
              style={mineOnly ? { background: 'var(--brand-action)', color: 'var(--ink)' } : undefined}
              onClick={() => setMineOnly((v) => !v)}
              aria-pressed={mineOnly}
              disabled={!!urlAssignee}
              title={urlAssignee ? 'Başqa istifadəçi süzgəci aktivdir — yuxarıdakı banner-dən təmizlə' : undefined}
            >
              {mineOnly ? '✓ Mənim' : 'Mənim'}
            </button>
            {isAdmin && archivableCount > 0 ? (
              <button className="btn-outline" onClick={() => setConfirmArchive(true)}>
                Arxivlə ({archivableCount})
              </button>
            ) : null}
            {/* Bulk operations are admin-tier — matches `bulkArchive` and
                `bulkReassign` gating elsewhere in this file. */}
            {view === 'table' && isAdmin ? (
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
                  `tasks-${todayStr}`,
                  ['Başlıq', 'Status', 'Layihə', 'Deadline', 'İcraçılar', 'Yaradıldı'],
                  filtered.map((t) => ({
                    'Başlıq': t.title,
                    'Status': TASK_STATUS_LABEL[t.status],
                    // Resolve project_id → name; fall back to '' (not the
                    // UUID) so spreadsheets stay human-readable.
                    'Layihə': t.project_id ? projectById[t.project_id]?.name ?? '' : '',
                    'Deadline': t.deadline ?? '',
                    'İcraçılar': (t.assignee_ids ?? [])
                      .map((id) => profileById[id]?.full_name ?? id)
                      .join('; '),
                    // Match the Deadline format (YYYY-MM-DD) so both date
                    // columns parse the same way in Excel/Numbers.
                    'Yaradıldı': t.created_at ? t.created_at.slice(0, 10) : '',
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
                  if (e.target.value) createFromTemplate.mutate(e.target.value);
                  // Controlled value="" already pins the select back to the
                  // placeholder after this render — no DOM mutation needed.
                }}
                disabled={createFromTemplate.isPending}
                aria-label="Şablondan tapşırıq yarat"
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
        // PRD §6.6 — toolbar landmark groups the filter cluster for screen readers.
        role="toolbar"
        aria-label="Tapşırıq filtrləri və görünüş"
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
          onChange={(e) => changeSort(e.target.value as TaskSortKey)}
          aria-label="Sıralama"
        >
          <option value="deadline">↑ Son tarix</option>
          <option value="priority">Prioritet</option>
          <option value="created">Yenilər əvvəl</option>
        </select>
        {/* PRD §UX — deadline=today quick filter. Distinct from the BU GÜN column,
            which is status-based; this is purely deadline-based. */}
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
          title="Yalnız bu gün son tarixi olanları göstər"
        >
          {todayOnly ? '✓ Bugünkü son tarix' : 'Bugünkü son tarix'}
        </button>
        {/* PRD §UX — narrow to a single project. Dropdown lists active
            projects only; the projectById lookup separately covers archived
            ones so task cards still show their project name post-archive. */}
        {activeProjects.length > 0 ? (
          <select
            className="input"
            style={{ maxWidth: 200, height: 32, fontSize: 12 }}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Layihəyə görə süz"
          >
            <option value="">Bütün layihələr</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
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
        {/* Design spec §8.3 — view toggles: Lövhə · Cədvəl · Təqvim · Gantt */}
        {(['board', 'table', 'calendar', 'gantt'] as const).map((v) => {
          const label =
            v === 'board' ? 'Lövhə' :
            v === 'table' ? 'Cədvəl' :
            v === 'calendar' ? 'Təqvim' : 'Gantt';
          return (
            <button
              key={v}
              className={`chip ${view === v ? 'chip-brand' : ''}`}
              onClick={() => setView(v)}
            >
              {label}
            </button>
          );
        })}
        {/* PRD §6.x — label filter chips */}
        {allLabels.length > 0 ? (
          <>
            <span style={{ width: 1, background: 'var(--line)', margin: '0 4px' }} />
            <button
              className={`chip ${labelFilter === null ? 'chip-brand' : ''}`}
              onClick={() => setLabelFilter(null)}
              aria-pressed={labelFilter === null}
            >
              {labelFilter === null ? '✓ Bütün etiketlər' : 'Bütün etiketlər'}
            </button>
            {allLabels.map((l) => {
              // PRD §UX — show per-label task count so filter chips signal volume.
              // Pulled from the labelCounts memo so this is O(1) per chip.
              const count = labelCounts.get(l) ?? 0;
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
              onClick={clearAllFilters}
              title="Bütün filtrləri təmizlə"
            >
              ✕ Təmizlə
            </button>
          </>
        ) : null}
      </div>

      {/* PRD §UX — assignee filter from URL banner with one-click clear */}
      {urlAssignee ? (
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
        // PRD §6.7 — skeleton matches layout (consistent with Projects/Clients).
        <SkeletonList rows={6} />
      ) : tasks.length === 0 ? (
        // Two empty-state branches: a true "no tasks anywhere" message vs.
        // "you're scoped to one user and they have none". The latter
        // shouldn't push a "+ Yeni tapşırıq" CTA — the viewer might not be
        // an admin and can't usefully create on someone else's behalf here.
        filterAssignee ? (
          <EmptyState
            title="Bu istifadəçinin tapşırığı yoxdur"
            body="Hələ heç bir aktiv tapşırıq təyin edilməyib."
          />
        ) : (
          <EmptyState
            title="Hələ tapşırıq yoxdur"
            body="İlk tapşırığı yarat və BU GÜN sütunu canlanacaq."
            cta={
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni tapşırıq
              </button>
            }
          />
        )
      ) : filtered.length === 0 ? (
        // PRD §UX — filters silenced all rows; tell user how to undo
        <EmptyState
          title="Filtrə uyğun tapşırıq yoxdur"
          body="Axtarış, etiket, layihə və ya son tarix filtrini ləğv et."
          cta={
            <button
              type="button"
              className="btn-outline"
              onClick={clearAllFilters}
            >
              ✕ Filtrləri təmizlə
            </button>
          }
        />
      ) : mineOnly ? (
        <TaskPersonalList
          groupedByTime={groupedByTime}
          projectById={projectById}
          bulkMode={bulkMode}
          selectedIds={selectedIds}
          completingIds={completingIds}
          onToggleSelected={toggleSelected}
          onMarkCompleting={(id) => setCompletingIds((s) => new Set(s).add(id))}
          onMove={moveTask}
          onOpenComments={(t) => setCommenting({ id: t.id, title: t.title })}
          onCancel={(t) => setCancelling({ id: t.id, title: t.title })}
        />
      ) : view === 'board' ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {TASK_STATUS_ORDER.filter((s) => !compactBoard || (s !== 'done' && s !== 'cancelled')).map((s) => {
            // Design spec §8.3 — column order is İdeyalar · BU GÜN · İcrada · …
            // BU GÜN = "queued" (planned-for-today work), which is the ink column;
            // İcrada = "active" (in-progress). The status enum's "queued" label is
            // Başlanmayıb, but on the board the ink column is rebranded BU GÜN.
            const isToday = s === 'queued';
            const tone = TASK_STATUS_TONE[s];
            // PRD §UX — sum estimated hours per column so user sees workload per stage.
            // Falls back to 0 when estimated_duration is null; uses duration_unit for h/d/w.
            const totalHours = grouped[s].reduce(
              (sum, t) =>
                t.estimated_duration == null
                  ? sum
                  : sum + durationToHours(t.estimated_duration, t.duration_unit),
              0,
            );
            return (
              <div
                key={s}
                className="rounded-card p-3 transition-colors"
                style={{
                  background: dragOverColumn === s
                    ? 'var(--brand-glow-sm)'
                    : isToday ? 'var(--ink)' : 'transparent',
                  color: isToday ? 'var(--canvas)' : 'inherit',
                  border: dragOverColumn === s
                    ? '2px dashed var(--brand-action)'
                    : isToday ? 'none' : '1px dashed var(--line)',
                  minHeight: 320,
                }}
                onDragOver={(e) => { e.preventDefault(); if (dragOverColumn !== s) setDragOverColumn(s); }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => {
                  setDragOverColumn(null);
                  // Drop payload may be foreign (browser bookmark, plain text
                  // from another app) — never let JSON.parse throw into React.
                  const raw = e.dataTransfer.getData('text/plain');
                  if (!raw) return;
                  let payload: { id?: string; from?: TaskStatus };
                  try {
                    payload = JSON.parse(raw);
                  } catch {
                    return;
                  }
                  if (!payload?.id) return;
                  if (payload.from !== s) moveTask(payload.id, s, payload.from);
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
                <div className="space-y-2" role="list" aria-label={TASK_STATUS_LABEL[s]}>
                  {grouped[s].map((t) => {
                    // PRD §UX — surface overdue tasks visually on the board so they
                    // can't be missed when scrolling through a column. Skip done/cancelled.
                    // Uses todayStr from outer scope (one Date(), not per-card).
                    const isOverdue = !!t.deadline
                      && t.status !== 'done' && t.status !== 'cancelled'
                      && t.deadline < todayStr;
                    return (
                    <article
                      key={t.id}
                      // Parent <div> declares role="list"; <article> default
                      // implicit role is "article" which breaks the list
                      // semantics. Explicit listitem keeps the row count
                      // exposed to AT.
                      role="listitem"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ id: t.id, from: t.status }),
                        );
                        setDraggingId(t.id);
                      }}
                      // dragEnd fires even when the drop happens outside any
                      // column (or is cancelled with Esc) — clear the
                      // highlight + the source-dim so neither ghosts.
                      onDragEnd={() => {
                        setDragOverColumn(null);
                        setDraggingId(null);
                      }}
                      className="rounded-card p-3 text-body"
                      style={{
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
                        opacity: draggingId === t.id ? 0.4 : 1,
                        transition: 'opacity 120ms ease',
                      }}
                    >
                      {/* Priority is conveyed by the left border (3px coloured
                          stripe above) and the ↑/→/↓ chip below — title stays
                          clean. Previously also had a 🔴 prefix only for "high",
                          which made the visual treatment asymmetric. */}
                      <div
                        className="font-medium cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setCommenting({ id: t.id, title: t.title }); }}
                        title={(() => {
                          // PRD §UX — tooltip combines description (if any) + created age
                          const parts: string[] = [];
                          if (t.description) parts.push(t.description);
                          if (t.created_at) parts.push(`Yaradılıb: ${new Date(t.created_at).toLocaleDateString('az-AZ')}`);
                          if (t.priority) parts.push(`Prioritet: ${t.priority}`);
                          return parts.length ? parts.join('\n\n') : undefined;
                        })()}
                      >
                        {t.title}
                      </div>
                      {/* Design spec §8.3 — project context on each card */}
                      {t.project_id && projectById[t.project_id] ? (
                        <div
                          className="text-meta mt-0.5"
                          style={{
                            color: isToday ? 'var(--text-faint)' : 'var(--text-muted)',
                            fontSize: 11,
                          }}
                        >
                          {projectById[t.project_id].name}
                        </div>
                      ) : null}
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
                {/* Design spec §8.3 — "+ N daha" expand archived (Tamamlandı only) */}
                {s === 'done' && (archivedDoneCount.data ?? 0) > 0 ? (
                  <button
                    type="button"
                    className="mt-2 w-full text-left text-meta opacity-60 hover:opacity-100 py-1 px-2 rounded-btn"
                    style={{ color: 'var(--text-muted)', fontSize: 12 }}
                    onClick={() => setExpandedArchive((v) => !v)}
                    aria-expanded={expandedArchive}
                  >
                    {expandedArchive ? '− Arxivi gizlət' : `+ ${archivedDoneCount.data} daha`}
                  </button>
                ) : null}
                {s === 'done' && expandedArchive ? (
                  <div className="mt-2 space-y-2">
                    {archivedDone.isLoading ? (
                      <p className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        Yüklənir…
                      </p>
                    ) : (archivedDone.data ?? []).length === 0 ? (
                      <p className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        Arxivdə Tamamlandı yoxdur.
                      </p>
                    ) : (
                      (archivedDone.data ?? []).map((t) => {
                        const proj = t.project_id ? projectById[t.project_id] : null;
                        return (
                          <article
                            key={t.id}
                            className="rounded-card p-2 text-body"
                            style={{
                              background: 'var(--surface-mist)',
                              border: '1px dashed var(--line)',
                              opacity: 0.75,
                            }}
                          >
                            <div
                              className="font-medium cursor-pointer"
                              style={{ fontSize: 12 }}
                              onClick={() => setCommenting({ id: t.id, title: t.title })}
                            >
                              {t.title}
                            </div>
                            {proj ? (
                              <div
                                className="text-meta"
                                style={{ color: 'var(--text-muted)', fontSize: 10 }}
                              >
                                {proj.name}
                              </div>
                            ) : null}
                            {t.archived_at ? (
                              <div
                                className="text-meta"
                                style={{ color: 'var(--text-muted)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
                              >
                                Arxivləndi: {t.archived_at.slice(0, 10)}
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    )}
                  </div>
                ) : null}
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
      ) : view === 'calendar' ? (
        <TaskCalendarView
          tasks={filtered}
          year={calMonth.year}
          month={calMonth.month}
          onPrev={() =>
            setCalMonth(({ year, month }) =>
              month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
            )
          }
          onNext={() =>
            setCalMonth(({ year, month }) =>
              month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
            )
          }
          onToday={() => setCalMonth(currentMonthInBaku())}
          onOpen={(t) => setCommenting({ id: t.id, title: t.title })}
        />
      ) : view === 'gantt' ? (
        <TaskGanttView
          tasks={filtered}
          startDate={ganttStart}
          onShift={(days) => {
            const d = new Date(ganttStart + 'T00:00:00');
            d.setDate(d.getDate() + days);
            setGanttStart(d.toISOString().slice(0, 10));
          }}
          onToday={() => setGanttStart(daysFromTodayInBaku(-7))}
          onOpen={(t) => setCommenting({ id: t.id, title: t.title })}
          projectById={projectById}
        />
      ) : (
        // Design spec §8.3 — Cədvəl columns: Tapşırıq · Layihə · İcraçı · Phase · Vaxt · Status
        <table
          className="w-full text-body"
          aria-label={`Tapşırıq cədvəli, ${filtered.length} sıra`}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {bulkMode ? (
                <th
                  className="text-meta text-left py-3 px-3"
                  style={{ width: 36 }}
                  aria-label="Seçim sütunu"
                />
              ) : null}
              {['Tapşırıq', 'Layihə', 'İcraçı', 'Phase', 'Vaxt', 'Status'].map((h) => (
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
            {sortedForTable.map((t) => {
              const selected = bulkMode && selectedIds.has(t.id);
              const proj = t.project_id ? projectById[t.project_id] : null;
              // Phase: surface project's first declared phase, or "Ekspertiza"
              // for expertise subtasks (architectural-phase concept per PRD §326).
              const phase = t.is_expertise_subtask
                ? 'Ekspertiza'
                : proj?.phases?.[0] ?? null;
              const durationStr = formatEstimatedDuration(
                t.estimated_duration,
                t.duration_unit,
              );
              // Mirror the board's overdue treatment so the same data reads
              // the same way in both views (not color-only — deadline text is
              // already red via TIME_GROUP_COLOR; tint adds row-level signal).
              const isOverdue = !!t.deadline
                && t.status !== 'done' && t.status !== 'cancelled'
                && t.deadline < todayStr;
              return (
                <tr
                  key={t.id}
                  onClick={() =>
                    bulkMode ? toggleSelected(t.id) : setCommenting({ id: t.id, title: t.title })
                  }
                  className="hover:bg-surface-mist cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--line-soft)',
                    background: selected
                      ? 'var(--brand-glow-sm)'
                      : isOverdue
                      ? 'var(--error-bg)'
                      : undefined,
                  }}
                  title={bulkMode ? 'Seçimi dəyişdir' : 'Şərhləri aç'}
                >
                  {bulkMode ? (
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(t.id)}
                        style={{
                          accentColor: 'var(--brand-action)',
                          width: 16,
                          height: 16,
                          cursor: 'pointer',
                        }}
                        aria-label={`${t.title} seç`}
                      />
                    </td>
                  ) : null}
                  <td className="py-3 px-3">{t.title}</td>
                  <td className="py-3 px-3" style={{ color: proj ? undefined : 'var(--text-muted)' }}>
                    {proj?.name ?? '—'}
                  </td>
                  <td className="py-3 px-3">
                    <AvatarGroup people={assigneePeople(t.assignee_ids)} size={24} />
                  </td>
                  <td className="py-3 px-3" style={{ color: phase ? undefined : 'var(--text-muted)' }}>
                    {phase ?? '—'}
                  </td>
                  <td className="py-3 px-3">
                    {t.deadline ? (
                      <span
                        style={{
                          color: TIME_GROUP_COLOR[taskTimeGroup(t, todayStr, endOfWeekStr)],
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {t.deadline}
                        {durationStr ? (
                          <span
                            style={{
                              marginLeft: 6,
                              color: 'var(--text-muted)',
                              fontSize: 11,
                            }}
                          >
                            · {durationStr}
                          </span>
                        ) : null}
                      </span>
                    ) : durationStr ? (
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {durationStr}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="py-3 px-3">{TASK_STATUS_LABEL[t.status]}</td>
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
          // If the user has narrowed the board to a single project, pre-fill
          // it on the new task — otherwise the quick-add modal opens with
          // no project context and the user has to re-pick.
          defaultProjectId={projectFilter || undefined}
          onClose={() => setQuickAddCol(null)}
        />
      ) : null}

      {cancelling ? (
        <CancelTaskModal
          taskId={cancelling.id}
          taskTitle={cancelling.title}
          onCancel={() => setCancelling(null)}
          onCancelled={() => setCancelling(null)}
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

      {bulkMode && selectedIds.size > 0 ? (
        <BulkActionBar
          selectedCount={selectedIds.size}
          isAdmin={isAdmin}
          profiles={allProfiles}
          onReassign={(id) => bulkReassign.mutate(id)}
          isReassigning={bulkReassign.isPending}
          onArchive={() => bulkArchiveSelected.mutate()}
          isArchiving={bulkArchiveSelected.isPending}
          onClose={exitBulkMode}
        />
      ) : null}

      {/* PRD §6.6 — uses ConfirmDialog (role=dialog, aria-modal, Escape handler,
          focus styles) instead of a hand-rolled overlay. */}
      <ConfirmDialog
        open={confirmArchive}
        title="Toplu arxivləmə"
        body={`${archivableCount} ədəd Tamamlandı / Ləğv edildi tapşırığı arxivlənəcək. Tapşırıqlar lövhədən silinəcək; Arxiv bölməsindən bərpa edilə bilər.`}
        confirmLabel="Arxivlə"
        cancelLabel="Ləğv et"
        busy={bulkArchive.isPending}
        onConfirm={() => bulkArchive.mutate()}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
}
