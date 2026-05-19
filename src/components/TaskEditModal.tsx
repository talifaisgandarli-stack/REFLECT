/**
 * REQ-TASK-EDIT — edit an existing task's core fields (title, description,
 * project, deadline, status, assignees, duration). Mirrors TaskCreateModal
 * but without the expertise-subtask scaffolding (that only seeds on create).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useProjects } from '@/lib/hooks';
import { useFocusTrap } from '@/lib/a11y';
import type { Task, TaskStatus } from '@/types/db';

type Props = { task: Task; onClose: () => void };

// PRD §MODULE 4 — full 7-status model. Edit modal must expose `cancelled`
// so a user can read/clear `cancel_reason`; switching INTO cancelled from this
// modal requires the reason field to be non-empty (DB trigger guards it too).
const STATUS_OPTIONS: TaskStatus[] = ['idea', 'queued', 'active', 'review', 'expert', 'done', 'cancelled'];
const CANCEL_REASONS = [
  'Müştəri imtina etdi',
  'Layihə dəyişdi',
  'Texniki problem',
  'Yenidən planlaşdırılır',
  'Digər',
] as const;
const STATUS_LABEL: Record<TaskStatus, string> = {
  idea: 'İdeyalar',
  queued: 'Başlanmayıb',
  active: 'İcrada',
  review: 'Yoxlamada',
  expert: 'Ekspertizada',
  done: 'Tamamlandı',
  cancelled: 'Ləğv edilmiş',
};
const DURATION_UNITS = ['hours', 'days'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
const DURATION_LABEL: Record<DurationUnit, string> = { hours: 'saat', days: 'gün' };

export function TaskEditModal({ task, onClose }: Props) {
  const { isAdmin } = useAuth();
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
  // PRD §REQ-TASK-04 / REQ-TASK-06 / REQ-TASK-09 — edit modal previously dropped
  // these fields, so they were creatable but not editable. Add them so the form
  // round-trips the full task shape.
  const [riskBuffer, setRiskBuffer] = useState<string>(
    task.risk_buffer_pct != null ? String(task.risk_buffer_pct) : '0',
  );
  const [isExpertise, setIsExpertise] = useState<boolean>(!!task.is_expertise_subtask);
  const initialReasonKnown = CANCEL_REASONS.find((r) => r === (task.cancel_reason ?? ''));
  const [cancelReasonChoice, setCancelReasonChoice] = useState<string>(
    task.cancel_reason ? (initialReasonKnown ?? 'Digər') : '',
  );
  const [cancelReasonOther, setCancelReasonOther] = useState<string>(
    task.cancel_reason && !initialReasonKnown ? task.cancel_reason : '',
  );

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

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Başlıq tələb olunur');
      if (startDate && deadline && deadline < startDate) {
        throw new Error('Bitmə tarixi başlama tarixindən əvvəl ola bilməz.');
      }
      // PRD REQ-TASK-04 — cancelled requires reason (DB trigger also enforces).
      let cancelReason: string | null = null;
      if (status === 'cancelled') {
        if (!cancelReasonChoice) throw new Error('Ləğv səbəbini seçin.');
        if (cancelReasonChoice === 'Digər' && !cancelReasonOther.trim()) {
          throw new Error('Səbəbi yazın (Digər).');
        }
        cancelReason = cancelReasonChoice === 'Digər' ? cancelReasonOther.trim() : cancelReasonChoice;
      }
      const risk = Math.max(0, Math.min(100, Number(riskBuffer) || 0));
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
          risk_buffer_pct: risk,
          is_expertise_subtask: isExpertise,
          // Clear stale reason when leaving cancelled; otherwise persist current.
          cancel_reason: cancelReason,
        })
        .eq('id', task.id);
      if (error) throw error;
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
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
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
                  <option key={u} value={u}>{DURATION_LABEL[u]}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* PRD §REQ-TASK-06 — risk buffer % (workload formula multiplier) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Risk buferi %">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                className="input"
                value={riskBuffer}
                onChange={(e) => setRiskBuffer(e.target.value)}
                title="workload = müddət × (1 + risk%/100)"
              />
            </Field>
            <Field label="Tapşırıq tipi">
              <label className="flex items-center gap-2 chip cursor-pointer" style={{ background: isExpertise ? 'var(--brand-action)' : 'var(--surface)', color: isExpertise ? 'var(--ink)' : 'var(--text)', height: 38, padding: '0 12px' }}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isExpertise}
                  onChange={(e) => setIsExpertise(e.target.checked)}
                />
                {isExpertise ? '✓ Ekspertiza tapşırığı' : 'Ekspertiza tapşırığı'}
              </label>
            </Field>
          </div>

          {/* PRD §REQ-TASK-04 — cancelled status requires a reason */}
          {status === 'cancelled' ? (
            <>
              <Field label="Ləğv səbəbi" required>
                <select
                  className="input"
                  value={cancelReasonChoice}
                  onChange={(e) => setCancelReasonChoice(e.target.value)}
                  required
                >
                  <option value="">— seç —</option>
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
              {cancelReasonChoice === 'Digər' ? (
                <Field label="Səbəbi yaz" required>
                  <textarea
                    className="input"
                    value={cancelReasonOther}
                    onChange={(e) => setCancelReasonOther(e.target.value)}
                    style={{ minHeight: 60, padding: '12px 14px' }}
                    required
                  />
                </Field>
              ) : null}
            </>
          ) : null}

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

          {save.error ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</p>
          ) : null}
        </div>

        <div className="flex gap-3 justify-end mt-5">
          <button type="button" className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
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
