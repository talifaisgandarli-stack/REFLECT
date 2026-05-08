/**
 * Project + Task mutations.
 * REQ-PROJ-01..02, REQ-TASK-01, REQ-TASK-04, REQ-TASK-06.
 *
 * NOTE: invariants enforced both at DB (CHECK + triggers from 0001/0004) and
 * at the form layer here so users get fast feedback. activity_log is written
 * by the DB triggers — no extra writes from the mutations below.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { ValidationError } from './finance';
import type { ProjectStatus, TaskStatus } from '@/types/db';
import { CANCEL_REASONS } from './labels';

// ----------------------------------------------------------------------------
// Projects
// ----------------------------------------------------------------------------

export type ProjectInput = {
  name: string;
  client_id?: string | null;
  /** Selected from PROJECT_PHASES; order preserved. */
  phases: string[];
  requires_expertise: boolean;
  expertise_deadline?: string | null;
  payment_buffer_days?: number;
  start_date?: string | null;
  deadline?: string | null;
};

/** REQ-PROJ-02 — calendar-day backward plan. v1 only; working-days is v2. */
export function computeDesignDeadline(input: {
  expertise_deadline: string;
  payment_buffer_days?: number;
}): string {
  const buf = input.payment_buffer_days ?? 10;
  const offsetDays = buf + 30 + 10 + 3;
  const d = new Date(input.expertise_deadline + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      if (!input.name.trim()) throw new ValidationError('Layihə adı boş ola bilməz.');
      if (input.phases.length === 0) throw new ValidationError('Ən azı bir mərhələ seç.');
      if (input.requires_expertise && !input.expertise_deadline) {
        throw new ValidationError('Ekspertiza tarixi tələb olunur.');
      }

      // REQ-PROJ-02: derive design_deadline if not provided.
      const deadline =
        input.deadline ??
        (input.requires_expertise && input.expertise_deadline
          ? computeDesignDeadline({
              expertise_deadline: input.expertise_deadline,
              payment_buffer_days: input.payment_buffer_days,
            })
          : null);

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: input.name.trim(),
          client_id: input.client_id ?? null,
          phases: input.phases,
          requires_expertise: input.requires_expertise,
          expertise_deadline: input.expertise_deadline ?? null,
          payment_buffer_days: input.payment_buffer_days ?? 10,
          start_date: input.start_date ?? null,
          deadline,
          status: 'active' satisfies ProjectStatus,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// ----------------------------------------------------------------------------
// Tasks
// ----------------------------------------------------------------------------

export type TaskInput = {
  title: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  task_level?: number;
  status?: TaskStatus;
  assignee_ids?: string[];
  start_date?: string | null;
  deadline?: string | null;
  estimated_duration?: number | null;
  duration_unit?: 'hours' | 'days' | 'weeks';
  risk_buffer_pct?: number;
  is_expertise_subtask?: boolean;
};

/** REQ-TASK-06 — workload = estimated_duration × (1 + risk_buffer_pct/100). */
export function computeWorkload(estimated: number | null | undefined, riskPct: number | null | undefined) {
  if (estimated == null || !Number.isFinite(estimated)) return null;
  const buf = (riskPct ?? 0) / 100;
  return estimated * (1 + buf);
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      if (!input.title.trim()) throw new ValidationError('Tapşırığın başlığı boş ola bilməz.');
      const buf = input.risk_buffer_pct ?? 0;
      if (buf < 0 || buf > 100) {
        throw new ValidationError('Risk buferi 0–100% aralığında olmalıdır.');
      }
      if (input.estimated_duration != null && input.estimated_duration < 0) {
        throw new ValidationError('Müddət mənfi ola bilməz.');
      }

      const workload = computeWorkload(input.estimated_duration, buf);

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: input.title.trim(),
          description: input.description ?? null,
          project_id: input.project_id ?? null,
          parent_task_id: input.parent_task_id ?? null,
          task_level: input.task_level ?? 0,
          status: (input.status ?? 'queued') satisfies TaskStatus,
          assignee_ids: input.assignee_ids ?? [],
          start_date: input.start_date ?? null,
          deadline: input.deadline ?? null,
          estimated_duration: input.estimated_duration ?? null,
          duration_unit: input.duration_unit ?? 'hours',
          risk_buffer_pct: buf,
          is_expertise_subtask: !!input.is_expertise_subtask,
          workload,
          workload_calculated_at: workload != null ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** REQ-TASK-04 — cancellation always requires reason. */
export type CancelReason = (typeof CANCEL_REASONS)[number];

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: CancelReason; detail?: string }) => {
      if (!input.reason) throw new ValidationError('Səbəb seç.');
      if (input.reason === 'Digər' && !(input.detail ?? '').trim()) {
        throw new ValidationError('"Digər" üçün izahat tələb olunur.');
      }
      const reasonText =
        input.reason === 'Digər' && input.detail ? `Digər: ${input.detail.trim()}` : input.reason;
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'cancelled', cancel_reason: reasonText })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
