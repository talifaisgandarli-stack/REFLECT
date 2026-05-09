/**
 * REQ-TASK-01 — full task create modal.
 * Workload (REQ-TASK-06) is computed by the DB trigger tasks_recompute_workload (0006);
 * the UI shows a live preview only.
 *
 * REQ-TASK-09 — when "Ekspertiza alt-tapşırıqları əlavə et" is checked we
 * seed 5 child tasks (Çertyoj/Spesifikasiya/Möhür+imza/Çap+ciltləmə/Təhvil)
 * after the parent is inserted.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useProjects } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { EXPERTISE_SUBTASKS, computeWorkload } from '@/lib/workload';
import type { Task, TaskStatus } from '@/types/db';

type Props = { onClose: () => void };

const DURATION_UNITS = ['hours', 'days'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];

const STATUS_OPTIONS: TaskStatus[] = ['idea', 'queued', 'active'];

export function TaskCreateModal({ onClose }: Props) {
  const t = useT();
  const { profile } = useAuth();
  const projects = useProjects();
  const qc = useQueryClient();
  const durationLabel = (u: DurationUnit) => t(`task.create.duration.${u}`);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [status, setStatus] = useState<TaskStatus>('queued');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [estimated, setEstimated] = useState<string>('');
  const [unit, setUnit] = useState<DurationUnit>('hours');
  const [riskBuffer, setRiskBuffer] = useState<number>(0);
  const [withExpertise, setWithExpertise] = useState(false);
  const [assignSelf, setAssignSelf] = useState(true);

  const workloadPreview = useMemo(
    () => computeWorkload(parseFloat(estimated), riskBuffer),
    [estimated, riskBuffer],
  );

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error(t('task.create.title_required'));
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
        assignee_ids: assignSelf && profile?.id ? [profile.id] : [],
      };
      const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
      if (error) throw error;
      const parent = data as Task;

      if (withExpertise) {
        const children = EXPERTISE_SUBTASKS.map((t) => ({
          title: t,
          status: 'queued' as TaskStatus,
          project_id: parent.project_id,
          parent_task_id: parent.id,
          task_level: parent.task_level + 1,
          is_expertise_subtask: true,
          assignee_ids: parent.assignee_ids,
        }));
        const { error: childErr } = await supabase.from('tasks').insert(children);
        if (childErr) throw childErr;
      }
      return parent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label={t('task.create.title')}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{t('task.create.title')}</h2>

        <div className="mt-4 space-y-3">
          <Field label={t('task.create.title_field')} required>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('task.create.placeholder')}
              autoFocus
              required
            />
          </Field>

          <Field label={t('task.create.description_field')}>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: 88, padding: '12px 14px' }}
              placeholder={t('task.create.description_placeholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('task.create.project_field')}>
              <select
                className="input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">{t('task.create.project_none')}</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('task.create.status_field')}>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {t(`task.status.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('task.create.start_field')}>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label={t('task.create.deadline_field')}>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={startDate || undefined}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label={t('task.create.duration_field')}>
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
            <Field label={t('task.create.unit_field')}>
              <select
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value as DurationUnit)}
              >
                {DURATION_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {durationLabel(u)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('task.create.risk_label', { pct: riskBuffer })}>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={riskBuffer}
                onChange={(e) => setRiskBuffer(Number(e.target.value))}
                aria-label={t('task.create.risk_aria')}
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
              {t('task.create.workload_preview', {
                value: workloadPreview,
                unit: durationLabel(unit),
              })}
              <span className="opacity-60"> · {t('task.create.workload_note')}</span>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={assignSelf}
              onChange={(e) => setAssignSelf(e.target.checked)}
            />
            {t('task.create.assign_self')}
          </label>

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={withExpertise}
              onChange={(e) => setWithExpertise(e.target.checked)}
            />
            {t('task.create.expertise_subtasks')}
          </label>
        </div>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(create.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>
            {t('common.back')}
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim()}>
            {create.isPending ? t('task.create.saving') : t('task.create.submit')}
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
        {required ? <span style={{ color: 'var(--state-error)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
