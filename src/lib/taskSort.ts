/**
 * Pure task sorter for the Tapşırıqlar page. The board uses it per status
 * column; the table uses it once over the filtered list.
 *
 * - 'deadline' (default): nulls last, ascending (uses a high-codepoint
 *   sentinel so missing dates sort after any real YYYY-MM-DD).
 * - 'priority': high > medium > low > normal/missing; ties fall through
 *   to deadline order.
 * - 'created': newest first.
 */
import type { Task } from '@/types/db';

export type TaskSortKey = 'deadline' | 'priority' | 'created';

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  normal: 2,
};

// Sentinel above any printable ASCII so nulls sort after real dates.
const NULL_DATE_SENTINEL = '￿';

export function sortTasks(arr: Task[], sortBy: TaskSortKey): Task[] {
  return [...arr].sort((a, b) => {
    if (sortBy === 'priority') {
      const ap = PRIORITY_ORDER[a.priority ?? 'normal'] ?? 3;
      const bp = PRIORITY_ORDER[b.priority ?? 'normal'] ?? 3;
      if (ap !== bp) return ap - bp;
    }
    if (sortBy === 'created') {
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    }
    return (a.deadline ?? NULL_DATE_SENTINEL).localeCompare(b.deadline ?? NULL_DATE_SENTINEL);
  });
}
