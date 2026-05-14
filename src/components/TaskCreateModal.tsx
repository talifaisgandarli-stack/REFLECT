/**
 * REQ-TASK-01 — full task create modal.
 * Workload (REQ-TASK-06) is computed by the DB trigger tasks_recompute_workload (0006);
 * the UI shows a live preview only.
 *
 * REQ-TASK-09 — when "Ekspertiza alt-tapşırıqları əlavə et" is checked we
 * seed 5 child tasks (Çertyoj/Spesifikasiya/Möhür+imza/Çap+ciltləmə/Təhvil)
 * after the parent is inserted.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useProjects } from '@/lib/hooks';
import { useFocusTrap } from '@/lib/a11y';
import type { Task, TaskStatus } from '@/types/db';

type Props = {
  onClose: () => void;
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
};

const EXPERTISE_CHILDREN = [
  'Çertyoj hazırlığı',
  'Spesifikasiya',
  'Möhür + imza',
  'Çap + ciltləmə',
  'Ekspertizaya təhvil',
] as const;

const DURATION_UNITS = ['hours', 'days'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];

const DURATION_LABEL: Record<DurationUnit, string> = {
  hours: 'saat',
  days: 'gün',
};

const STATUS_OPTIONS: TaskStatus[] = ['idea', 'queued', 'active'];
const STATUS_LABEL: Record<TaskStatus, string> = {
  idea: 'İdeyalar',
  queued: 'Başlanmayıb',
  active: 'İcrada',
  review: 'Yoxlamada',
  expert: 'Ekspertizada',
  done: 'Tamamlandı',
  cancelled: 'Ləğv edilmiş',
};

export function TaskCreateModal({ onClose, defaultProjectId, defaultStatus }: Props) {
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
  const [withExpertise, setWithExpertise] = useState(false);
  const [assignSelf, setAssignSelf] = useState(true);
  const [extraAssignees, setExtraAssignees] = useState<string[]>([]);

  const workloadPreview = useMemo(() => {
    const e = parseFloat(estimated);
    if (Number.isNaN(e) || e <= 0) return null;
    return Math.round(e * (1 + riskBuffer / 100) * 100) / 100;
  }, [estimated, riskBuffer]);

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
        assignee_ids: (() => {
          const set = new Set<string>();
          if (assignSelf && profile?.id) set.add(profile.id);
          for (const id of extraAssignees) set.add(id);
          return Array.from(set);
        })(),
      };
      const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
      if (error) throw error;
      const parent = data as Task;

      if (withExpertise) {
        const children = EXPERTISE_CHILDREN.map((t) => ({
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        ref={trapRef}
        className="card w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 id="task-create-title" className="text-h2">Yeni tapşırıq</h2>

        <div className="mt-4 space-y-3">
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
                    {STATUS_LABEL[s]}
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
                onChange={(e) => setUnit(e.target.value as DurationUnit)}
              >
                {DURATION_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {DURATION_LABEL[u]}
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
              İş yükü ≈ <strong>{workloadPreview}</strong> {DURATION_LABEL[unit]}
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

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={withExpertise}
              onChange={(e) => setWithExpertise(e.target.checked)}
            />
            Ekspertiza alt-tapşırıqlarını əlavə et (5 ədəd)
          </label>
        </div>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(create.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim()}>
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
