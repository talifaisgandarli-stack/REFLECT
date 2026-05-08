/**
 * REQ-TASK-01 — full task create modal.
 * REQ-TASK-06 — workload preview computed live (DB also recomputes on save).
 *
 * "Quick create (title only)" — see TaskQuickCreate.tsx; this is the
 * everything-and-the-kitchen-sink path.
 */
import { FormEvent, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { computeWorkload, useCreateTask } from '@/lib/work';
import { ValidationError } from '@/lib/finance';
import { useProjects } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/db';

type Props = { onClose: () => void; defaultProjectId?: string };

export function TaskModal({ onClose, defaultProjectId }: Props) {
  const projects = useProjects();
  const m = useCreateTask();
  const profiles = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: async (): Promise<Profile[]> =>
      ((await supabase.from('profiles').select('*').eq('is_active', true)).data ?? []) as Profile[],
  });

  const [assignees, setAssignees] = useState<string[]>([]);
  const [estimated, setEstimated] = useState<string>('');
  const [riskBuffer, setRiskBuffer] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  const workloadPreview = useMemo(
    () => computeWorkload(estimated === '' ? null : Number(estimated), riskBuffer),
    [estimated, riskBuffer],
  );

  function toggleAssignee(id: string) {
    setAssignees((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      await m.mutateAsync({
        title: String(f.get('title') ?? ''),
        description: (f.get('description') as string) || null,
        project_id: (f.get('project_id') as string) || null,
        assignee_ids: assignees,
        start_date: (f.get('start_date') as string) || null,
        deadline: (f.get('deadline') as string) || null,
        estimated_duration: estimated === '' ? null : Number(estimated),
        duration_unit: (f.get('duration_unit') as 'hours' | 'days' | 'weeks') || 'hours',
        risk_buffer_pct: riskBuffer,
        is_expertise_subtask: f.get('is_expertise_subtask') === 'on',
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="+ Yeni tapşırıq" onClose={onClose} width={620}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Başlıq *">
          <input name="title" type="text" required autoFocus className="input" />
        </Field>

        <Field label="Layihə">
          <select name="project_id" className="input" defaultValue={defaultProjectId ?? ''}>
            <option value="">—</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="İcraçılar">
          <div className="flex flex-wrap gap-2 mt-1">
            {(profiles.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${assignees.includes(p.id) ? 'chip-brand' : ''}`}
                onClick={() => toggleAssignee(p.id)}
              >
                {p.full_name ?? p.email}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlama">
            <input name="start_date" type="date" className="input" />
          </Field>
          <Field label="Deadline">
            <input name="deadline" type="date" className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Müddət">
            <input
              type="number"
              min={0}
              step="0.5"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Vahid">
            <select name="duration_unit" className="input" defaultValue="hours">
              <option value="hours">saat</option>
              <option value="days">gün</option>
              <option value="weeks">həftə</option>
            </select>
          </Field>
          <Field label="Risk buferi %">
            <input
              type="number"
              min={0}
              max={100}
              value={riskBuffer}
              onChange={(e) => setRiskBuffer(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>

        {workloadPreview != null ? (
          <div
            className="text-meta px-3 py-2 rounded-btn"
            style={{ background: 'var(--surface-mist)', color: 'var(--text-soft)' }}
          >
            Hesablanmış yük: <strong style={{ color: 'var(--text)' }}>
              {workloadPreview.toFixed(2)}
            </strong>{' '}
            (REQ-TASK-06: {estimated} × (1 + {riskBuffer}/100))
          </div>
        ) : null}

        <Field label="Təsvir">
          <textarea name="description" className="input" style={{ height: 80, padding: 12 }} />
        </Field>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_expertise_subtask" />
          <span className="text-body">Ekspertiza alt-tapşırığı</span>
        </label>

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Ləğv et
          </button>
          <button type="submit" className="btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
