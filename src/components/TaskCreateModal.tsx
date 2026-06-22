/**
 * REQ-TASK-01 — full task create modal.
 * Workload (REQ-TASK-06) is computed by the DB trigger tasks_recompute_workload (0006);
 * the UI shows a live preview only.
 *
 * REQ-TASK-01/09 — subtasks are built manually inside this one card: the admin
 * adds any number of subtask rows, each with its own title and its own
 * assignee(s). A subtask with a title MUST have at least one assignee. They are
 * inserted as linked child tasks (parent_task_id + task_level+1) after the parent.
 * The "Ekspertiza dəsti" shortcut pre-fills the five expertise titles as editable
 * rows (still requiring an assignee each) — it no longer auto-creates them.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useProjects } from '@/lib/hooks';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { useFocusTrap } from '@/lib/a11y';
import {
  TASK_STATUS_LABEL,
  DURATION_UNITS,
  DURATION_UNIT_LABEL,
  type DurationUnit,
} from '@/lib/labels';
import {
  SubtaskBuilder,
  cleanSubtasks,
  subtaskError,
  type DraftSubtask,
} from '@/components/SubtaskBuilder';
import type { Task, TaskStatus } from '@/types/db';

type Props = {
  onClose: () => void;
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
  // PRD §REQ-TASK-01 — explicit subtask creation (parent context)
  parentTaskId?: string;
  parentTaskLevel?: number;
};

// Status options for the new-task dropdown — all non-cancelled statuses.
// Was previously restricted to the three "starting" buckets, but the board's
// per-column quick-add ("+ Tapşırıq" on review / expert / done) passes a
// defaultStatus the dropdown couldn't represent, leaving the controlled
// select visually empty or wrong while state held the real value.
// Cancellation has its own modal (CancelTaskModal) because it requires a
// reason, so 'cancelled' stays out.
const STATUS_OPTIONS: TaskStatus[] = ['idea', 'queued', 'active', 'review', 'expert', 'done'];

// Hours per working day — duration readout converts the day span to work hours.
const WORK_HOURS_PER_DAY = 8;

// Working days (Mon–Fri, inclusive of both endpoints) between two ISO dates —
// like Excel NETWORKDAYS. Weekends don't count toward duration. Null when either
// date is missing/invalid or end precedes start.
function workingDaysBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  let count = 0;
  for (const cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function TaskCreateModal({ onClose, defaultProjectId, defaultStatus, parentTaskId, parentTaskLevel }: Props) {
  const { profile, isAdmin } = useAuth();
  const projects = useProjects();
  const qc = useQueryClient();

  // REQ-TASK-02 — admins can multi-assign. Non-admins only get "assign self".
  const teamMembers = useQuery({
    queryKey: ['profiles', 'team-list'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name');
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string }>;
    },
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? '');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'queued');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [estimated, setEstimated] = useState<string>('');
  const [unit, setUnit] = useState<DurationUnit>('hours');
  const [riskBuffer, setRiskBuffer] = useState<number>(0);
  const [assignSelf, setAssignSelf] = useState(true);
  // migration 0068 — admin-only task (visible to admins only). Admins set it.
  const [adminOnly, setAdminOnly] = useState(false);

  // Auto-fill Müddət as the working-day span (Mon–Fri) when both dates are set.
  const applyAutoDuration = (s: string, d: string) => {
    const days = workingDaysBetween(s, d);
    if (days != null) {
      setEstimated(String(days));
      setUnit('days');
    }
  };
  // Convert the Müddət value when the user flips Vahid (gün ↔ saat, 8h/workday).
  const changeUnit = (next: DurationUnit) => {
    const n = parseFloat(estimated);
    if (!Number.isNaN(n) && next !== unit) {
      if (unit === 'days' && next === 'hours') setEstimated(String(Math.round(n * WORK_HOURS_PER_DAY)));
      else if (unit === 'hours' && next === 'days') setEstimated(String(Math.round((n / WORK_HOURS_PER_DAY) * 100) / 100));
    }
    setUnit(next);
  };
  const [extraAssignees, setExtraAssignees] = useState<string[]>([]);
  // PRD §REQ-TASK-01 — manually-built subtasks (shared SubtaskBuilder), each with
  // its own deadline + assignee(s). Hidden when this modal is itself creating a
  // subtask (we keep it to one level).
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>([]);
  const showSubtasks = !parentTaskId;
  const subtaskErr = subtaskError(subtasks);

  // People a subtask can be assigned to: admins pick from the whole team;
  // everyone else can only assign themselves.
  const assignable = useMemo(
    () =>
      isAdmin
        ? (teamMembers.data ?? [])
        : profile
          ? [{ id: profile.id, full_name: profile.full_name, email: profile.email }]
          : [],
    [isAdmin, teamMembers.data, profile],
  );

  const workloadPreview = useMemo(() => {
    const e = parseFloat(estimated);
    if (Number.isNaN(e) || e <= 0) return null;
    return Math.round(e * (1 + riskBuffer / 100) * 100) / 100;
  }, [estimated, riskBuffer]);

  // PRD §UX — guard accidental tab close while the form has content
  const isDirty = title.trim().length > 0 || description.trim().length > 0;
  useUnsavedChanges(isDirty);

  // PRD §UX — auto-save draft to localStorage so accidental close → reopen
  // restores the in-progress task. Cleared on successful create.
  const DRAFT_KEY = 'reflect.task-draft';
  useEffect(() => {
    if (!isDirty) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, ts: Date.now() }));
    } catch { /* ignore quota errors */ }
  }, [title, description, isDirty]);
  useEffect(() => {
    // On mount, hydrate from draft if present and fields are empty
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { title?: string; description?: string; ts?: number };
      // Discard drafts older than 1h to avoid stale rehydration
      if (draft.ts && Date.now() - draft.ts > 3600_000) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (draft.title && !title) setTitle(draft.title);
      if (draft.description && !description) setDescription(draft.description);
    } catch { /* corrupt JSON — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Başlıq tələb olunur');
      const payload: Partial<Task> = {
        title: trimmed,
        description: description.trim() || null,
        status,
        project_id: projectId || null,
        start_date: startDate || null,
        deadline: deadline || null,
        estimated_duration: estimated ? Number(estimated) : null,
        duration_unit: unit,
        risk_buffer_pct: Math.max(0, Math.min(100, Math.round(riskBuffer))),
        is_expertise_subtask: false,
        admin_only: isAdmin ? adminOnly : false,
        // PRD §REQ-TASK-01 — propagate parent context when creating a subtask
        ...(parentTaskId
          ? { parent_task_id: parentTaskId, task_level: (parentTaskLevel ?? 0) + 1 }
          : {}),
        assignee_ids: (() => {
          const set = new Set<string>();
          if (assignSelf && profile?.id) set.add(profile.id);
          for (const id of extraAssignees) set.add(id);
          return Array.from(set);
        })(),
      };
      // Validate subtasks up-front (deadline + assignee mandatory; empty rows
      // ignored). Keeps a half-filled row from silently creating bad data.
      const err = subtaskError(subtasks);
      if (err) throw new Error(err);
      const children = cleanSubtasks(subtasks);

      const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
      if (error) throw error;
      const parent = data as Task;

      if (children.length > 0) {
        const rows = children.map((s) => ({
          title: s.title,
          status: 'queued' as TaskStatus,
          project_id: parent.project_id,
          parent_task_id: parent.id,
          task_level: parent.task_level + 1,
          is_expertise_subtask: s.isExpertise,
          assignee_ids: s.assigneeIds,
          deadline: s.deadline,
        }));
        const { error: childErr } = await supabase.from('tasks').insert(rows);
        if (childErr) throw childErr;
      }
      return parent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      onClose();
    },
  });

  const trapRef = useFocusTrap<HTMLFormElement>(true);
  // Close on Escape — basic accessibility.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-create-title"
      className="modal-fade-in fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        ref={trapRef}
        className="modal-pop card w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        style={{ padding: 0, maxHeight: 'calc(100vh - 3rem)' }}
      >
        <div className="shrink-0" style={{ padding: '20px 24px 0' }}>
          <h2 id="task-create-title" className="text-h2">
            {parentTaskId ? 'Yeni alt-tapşırıq' : 'Yeni tapşırıq'}
          </h2>
          {parentTaskId ? (
            <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
              Ana tapşırığın altında yaradılır · səviyyə {(parentTaskLevel ?? 0) + 1}
            </p>
          ) : null}
        </div>

        {/* Scrollable body — header + footer stay pinned, content scrolls inside */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px' }}>
        <div className="space-y-3">
          <Field label="Başlıq" required>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nə görüləcək…"
              autoFocus
              required
            />
          </Field>

          <Field label="Təsvir (könüllü)">
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: 88, padding: '12px 14px' }}
              placeholder="Detal, kontekst, link…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Layihə">
              <select
                className="input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— layihəsiz —</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Başlama">
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => { const v = e.target.value; setStartDate(v); applyAutoDuration(v, deadline); }}
              />
            </Field>
            <Field label="Bitmə tarixi">
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => { const v = e.target.value; setDeadline(v); applyAutoDuration(startDate, v); }}
                min={startDate || undefined}
              />
            </Field>
          </div>

          {/* PRD §REQ-TASK — warn (don't block) if task deadline exceeds project deadline */}
          {(() => {
            if (!deadline || !projectId) return null;
            const proj = projects.data?.find((p) => p.id === projectId);
            if (!proj?.deadline) return null;
            if (deadline > proj.deadline) {
              return (
                <p
                  className="text-meta px-3 py-2 rounded-btn"
                  style={{
                    background: 'var(--warning-bg, #fff3d6)',
                    color: 'var(--ink)',
                    border: '1px solid var(--warning, #c47d00)',
                  }}
                >
                  ⚠ Tapşırığın bitmə tarixi layihənin bitmə tarixindən ({proj.deadline}) sonradır.
                </p>
              );
            }
            return null;
          })()}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Müddət">
              <input
                type="number"
                min={0}
                step="0.5"
                className="input"
                value={estimated}
                onChange={(e) => setEstimated(e.target.value)}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </Field>
            <Field label="Vahid">
              <select
                className="input"
                value={unit}
                onChange={(e) => changeUnit(e.target.value as DurationUnit)}
              >
                {DURATION_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {DURATION_UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Risk +${riskBuffer}%`}>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={riskBuffer}
                onChange={(e) => setRiskBuffer(Number(e.target.value))}
                aria-label="Risk buffer"
              />
            </Field>
          </div>

          {workloadPreview != null ? (
            <div
              className="text-meta px-3 py-2 rounded-btn"
              style={{
                background: 'var(--brand-mist)',
                color: 'var(--brand-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              İş yükü ≈ <strong>{workloadPreview}</strong> {DURATION_UNIT_LABEL[unit]}
              <span className="opacity-60"> · DB triggerdə təsdiq olunacaq</span>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={assignSelf}
              onChange={(e) => setAssignSelf(e.target.checked)}
            />
            Mənə təyin et
          </label>

          {/* migration 0068 — admin-only visibility (admins only) */}
          {isAdmin ? (
            <label className="flex items-center gap-2 text-body cursor-pointer">
              <input
                type="checkbox"
                checked={adminOnly}
                onChange={(e) => setAdminOnly(e.target.checked)}
              />
              🔒 Yalnız adminlər üçün (digər istifadəçilərə görünməz)
            </label>
          ) : null}

          {isAdmin ? (
            <Field label="Əlavə icraçılar (admin)">
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 rounded-btn" style={{ background: 'var(--surface-mist)' }}>
                {(teamMembers.data ?? []).filter((m) => m.id !== profile?.id).map((m) => {
                  const checked = extraAssignees.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-1.5 text-meta cursor-pointer chip" style={{ background: checked ? 'var(--brand-action)' : 'var(--surface)', color: checked ? 'var(--ink)' : 'var(--text)' }}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setExtraAssignees((a) => [...a, m.id]);
                          else setExtraAssignees((a) => a.filter((x) => x !== m.id));
                        }}
                      />
                      {m.full_name ?? m.email}
                    </label>
                  );
                })}
                {(teamMembers.data ?? []).length === 0 ? (
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Komanda üzvü yoxdur.</span>
                ) : null}
              </div>
            </Field>
          ) : null}

          {/* PRD §REQ-TASK-01 — manual subtasks, each with its own deadline + assignee(s) */}
          {showSubtasks ? (
            <SubtaskBuilder
              subtasks={subtasks}
              onChange={setSubtasks}
              assignable={assignable}
              minDate={startDate || undefined}
            />
          ) : null}
        </div>
        {create.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(create.error as Error).message}
          </p>
        ) : null}
        </div>

        <div
          className="shrink-0 flex justify-end gap-2"
          style={{ padding: '14px 24px', borderTop: '1px solid var(--line)' }}
        >
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim() || !!subtaskErr}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="text-meta block mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
        {required ? <span style={{ color: 'var(--error-deep)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
