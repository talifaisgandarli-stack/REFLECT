/**
 * REQ-TASK-EDIT — edit an existing task's core fields (title, description,
 * project, deadline, status, assignees, duration). Also lets you add new
 * subtasks (shared SubtaskBuilder) to a top-level task; each subtask needs its
 * own deadline + assignee(s). Existing subtasks are listed for context.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useProjects } from '@/lib/hooks';
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

type Props = { task: Task; onClose: () => void };

const STATUS_OPTIONS: TaskStatus[] = ['idea', 'queued', 'active', 'review', 'expert', 'done'];

export function TaskEditModal({ task, onClose }: Props) {
  const { isAdmin, profile } = useAuth();
  const projects = useProjects();
  const qc = useQueryClient();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [projectId, setProjectId] = useState<string>(task.project_id ?? '');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [startDate, setStartDate] = useState(task.start_date ?? '');
  const [deadline, setDeadline] = useState(task.deadline ?? '');
  const [estimated, setEstimated] = useState<string>(
    task.estimated_duration != null ? String(task.estimated_duration) : '',
  );
  const [unit, setUnit] = useState<DurationUnit>((task.duration_unit as DurationUnit) ?? 'hours');
  const [assignees, setAssignees] = useState<string[]>(task.assignee_ids ?? []);
  // New subtasks to create on save. Only top-level tasks get a builder (one level).
  const [newSubtasks, setNewSubtasks] = useState<DraftSubtask[]>([]);
  const showSubtasks = !task.parent_task_id;
  const subtaskErr = subtaskError(newSubtasks);

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

  // People a subtask can be assigned to: admins pick the whole team, others self.
  const assignable = useMemo(
    () =>
      isAdmin
        ? (teamMembers.data ?? [])
        : profile
          ? [{ id: profile.id, full_name: profile.full_name, email: profile.email }]
          : [],
    [isAdmin, teamMembers.data, profile],
  );

  // Existing subtasks — shown read-only for context while editing the parent.
  const existingSubtasks = useQuery({
    queryKey: ['tasks', 'children', task.id],
    enabled: showSubtasks,
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, deadline, status, assignee_ids')
        .eq('parent_task_id', task.id)
        .order('created_at');
      return (data ?? []) as Array<Pick<Task, 'id' | 'title' | 'deadline' | 'status' | 'assignee_ids'>>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Başlıq tələb olunur');
      if (startDate && deadline && deadline < startDate) {
        throw new Error('Bitmə tarixi başlama tarixindən əvvəl ola bilməz.');
      }
      // Validate new subtasks before touching the DB (deadline + assignee req.).
      const err = subtaskError(newSubtasks);
      if (err) throw new Error(err);

      const { error } = await supabase
        .from('tasks')
        .update({
          title: trimmed,
          description: description.trim() || null,
          status,
          project_id: projectId || null,
          start_date: startDate || null,
          deadline: deadline || null,
          estimated_duration: estimated ? Number(estimated) : null,
          duration_unit: unit,
          assignee_ids: assignees,
        })
        .eq('id', task.id);
      if (error) throw error;

      const children = cleanSubtasks(newSubtasks);
      if (children.length > 0) {
        const rows = children.map((s) => ({
          title: s.title,
          status: 'queued' as TaskStatus,
          project_id: projectId || null,
          parent_task_id: task.id,
          task_level: task.task_level + 1,
          is_expertise_subtask: s.isExpertise,
          assignee_ids: s.assigneeIds,
          deadline: s.deadline,
        }));
        const { error: childErr } = await supabase.from('tasks').insert(rows);
        if (childErr) throw childErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  // Hard-delete (danger zone, admin only — enforced by RLS tasks_admin_delete).
  // The 0001 FKs cascade to subtasks, comments, status history and time entries.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useMutation({
    mutationFn: async () => {
      // .select() so RLS-blocked deletes (which return 0 rows, no error) surface
      // as a real failure instead of a silent fake-success that closes the modal.
      const { data, error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'Silinmədi — icazə yoxdur. DB miqrasiyası 0067 (tasks_admin_delete) tətbiq edilməlidir.',
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  const trapRef = useFocusTrap<HTMLFormElement>(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tapşırığı düzəlt"
      className="modal-fade-in fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        ref={trapRef}
        className="modal-pop card w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">Tapşırığı düzəlt</h2>

        <div className="mt-4 space-y-3">
          <Field label="Başlıq" required>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </Field>

          <Field label="Təsvir">
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: 80, padding: '12px 14px' }}
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
                  <option key={p.id} value={p.id}>{p.name}</option>
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
                  <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
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
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Bitmə tarixi">
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={startDate || undefined}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Müddət">
              <input
                type="number"
                min={0}
                step="0.5"
                className="input"
                value={estimated}
                onChange={(e) => setEstimated(e.target.value)}
              />
            </Field>
            <Field label="Vahid">
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as DurationUnit)}>
                {DURATION_UNITS.map((u) => (
                  <option key={u} value={u}>{DURATION_UNIT_LABEL[u]}</option>
                ))}
              </select>
            </Field>
          </div>

          {isAdmin ? (
            <Field label="İcraçılar">
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 rounded-btn" style={{ background: 'var(--surface-mist)' }}>
                {(teamMembers.data ?? []).map((m) => {
                  const checked = assignees.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-1.5 text-meta cursor-pointer chip" style={{ background: checked ? 'var(--brand-action)' : 'var(--surface)', color: checked ? 'var(--ink)' : 'var(--text)' }}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setAssignees((a) => [...a, m.id]);
                          else setAssignees((a) => a.filter((x) => x !== m.id));
                        }}
                      />
                      {m.full_name ?? m.email}
                    </label>
                  );
                })}
              </div>
            </Field>
          ) : null}

          {/* Existing subtasks (read-only) + builder to add new ones */}
          {showSubtasks ? (
            <>
              {(existingSubtasks.data ?? []).length > 0 ? (
                <div className="rounded-btn p-2" style={{ background: 'var(--surface-mist)' }}>
                  <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Mövcud alt-tapşırıqlar
                  </span>
                  <ul className="space-y-1">
                    {(existingSubtasks.data ?? []).map((k) => {
                      const kDone = k.status === 'done' || k.status === 'cancelled';
                      return (
                        <li key={k.id} className="flex items-center justify-between gap-2 text-meta">
                          <span style={{ textDecoration: kDone ? 'line-through' : 'none', opacity: kDone ? 0.6 : 1 }}>
                            {k.title}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {k.deadline ?? '— son tarix yoxdur'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <SubtaskBuilder
                subtasks={newSubtasks}
                onChange={setNewSubtasks}
                assignable={assignable}
                minDate={startDate || undefined}
                legend="Yeni alt-tapşırıq əlavə et"
              />
            </>
          ) : null}

          {save.error ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</p>
          ) : null}

          {confirmDelete ? (
            <div
              className="p-3 rounded-btn"
              style={{ border: '1px solid var(--error-border)', background: 'var(--surface-mist)' }}
            >
              <p className="text-meta mb-2" style={{ color: 'var(--error-deep)' }}>
                Bu tapşırıq həmişəlik silinəcək — alt-tapşırıqlar, şərhlər, status
                tarixçəsi və vaxt qeydləri daxil. Bu əməliyyat geri qaytarıla bilməz.
              </p>
              {del.error ? (
                <p className="text-meta mb-2" style={{ color: 'var(--error-deep)' }}>{(del.error as Error).message}</p>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-outline" onClick={() => setConfirmDelete(false)} disabled={del.isPending}>Geri</button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'var(--error-deep)', borderColor: 'var(--error-deep)' }}
                  disabled={del.isPending}
                  onClick={() => del.mutate()}
                >
                  {del.isPending ? 'Silinir…' : 'Həmişəlik sil'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 justify-between items-center mt-5">
          <div>
            {isAdmin && !confirmDelete ? (
              <button
                type="button"
                className="btn-outline"
                style={{ color: 'var(--error-deep)', borderColor: 'var(--error-border)' }}
                onClick={() => setConfirmDelete(true)}
              >
                Sil
              </button>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-outline" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="btn-primary" disabled={save.isPending || !!subtaskErr}>
              {save.isPending ? 'Saxlanılır…' : 'Saxla'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}{required ? <span style={{ color: 'var(--error-deep)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
