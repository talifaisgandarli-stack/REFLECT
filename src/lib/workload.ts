/**
 * Workload calculation (REQ-TASK-06).
 *
 * Source-of-truth lives in the DB trigger tasks_recompute_workload (0006);
 * this helper mirrors the formula for the create-modal preview so users
 * see what they'll get before they save. Keep in sync if either side
 * changes.
 */
export const WORKLOAD_PRECISION = 2;

export function computeWorkload(
  estimated: number | null | undefined,
  riskBufferPct: number | null | undefined,
): number | null {
  if (estimated == null || !Number.isFinite(estimated) || estimated <= 0) return null;
  const buffer = Math.max(0, Math.min(100, Number(riskBufferPct ?? 0)));
  const raw = estimated * (1 + buffer / 100);
  const factor = 10 ** WORKLOAD_PRECISION;
  return Math.round(raw * factor) / factor;
}

/**
 * REQ-TASK-09 — expertise subtasks auto-suggested when a task is flagged
 * is_expertise_subtask. Localised AZ titles, exported so both the create
 * modal and any future bulk-import worker share the same list.
 */
export const EXPERTISE_SUBTASKS = [
  'Çertyoj hazırlığı',
  'Spesifikasiya',
  'Möhür + imza',
  'Çap + ciltləmə',
  'Ekspertizaya təhvil',
] as const;

export type ExpertiseSubtask = (typeof EXPERTISE_SUBTASKS)[number];
