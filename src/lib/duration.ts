/**
 * `tasks.duration_unit` is loose text — TaskCreateModal / TaskEditModal
 * write plural ('hours' / 'days'), the DB default is 'hours', and some
 * legacy rows may be singular. These helpers normalise once so every
 * column-total / row-label site agrees, regardless of which form the row
 * actually stores.
 *
 * Pure functions, no React, no DOM. Tested in src/lib/duration.test.ts.
 */
const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 40;

export type NormalizedDurationUnit = 'hour' | 'day' | 'week';

export function normalizeDurationUnit(unit: string | null | undefined): NormalizedDurationUnit {
  if (!unit) return 'hour';
  const s = unit.toLowerCase().replace(/s$/, '');
  return s === 'day' ? 'day' : s === 'week' ? 'week' : 'hour';
}

/** Convert {value, unit} to hours so column / page totals sum apples-to-apples. */
export function durationToHours(d: number, unit: string | null | undefined): number {
  const u = normalizeDurationUnit(unit);
  return u === 'day' ? d * HOURS_PER_DAY : u === 'week' ? d * HOURS_PER_WEEK : d;
}

/** Compact "Vaxt" label for the Cədvəl view: "8s" / "3g" / "2h". */
export function formatEstimatedDuration(
  d: number | null,
  unit: string | null | undefined,
): string | null {
  if (d == null) return null;
  const u = normalizeDurationUnit(unit);
  const suffix = u === 'day' ? 'g' : u === 'week' ? 'h' : 's';
  return `${d}${suffix}`;
}
