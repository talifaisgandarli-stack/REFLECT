/**
 * Pure filter chain for the Tapşırıqlar page. Same predicates the
 * `filtered` memo in Tasks.tsx applies, extracted so the logic is
 * testable without rendering the page.
 *
 * Order of filters is intentional: label → project → todayOnly → search.
 * Each step narrows the previous result, so the overall complexity is
 * O(N × number-of-active-filters).
 */
import type { Task } from '@/types/db';

export interface TaskFilterOpts {
  /** Label string, null when no label filter is active. */
  labelFilter: string | null;
  /** Project UUID, empty string when no project filter is active. */
  projectFilter: string;
  /** Restrict to tasks whose deadline === todayStr. */
  todayOnly: boolean;
  /** YYYY-MM-DD in Asia/Baku (compared with task.deadline). */
  todayStr: string;
  /** Substring match against title (case-insensitive, trimmed). */
  search: string;
}

export function filterTasks(tasks: Task[], opts: TaskFilterOpts): Task[] {
  let out = tasks;
  if (opts.labelFilter) {
    const target = opts.labelFilter;
    out = out.filter((t) => (t.labels ?? []).includes(target));
  }
  if (opts.projectFilter) {
    out = out.filter((t) => t.project_id === opts.projectFilter);
  }
  if (opts.todayOnly) {
    out = out.filter((t) => t.deadline === opts.todayStr);
  }
  const q = opts.search.trim().toLowerCase();
  if (q) {
    out = out.filter((t) => t.title.toLowerCase().includes(q));
  }
  return out;
}
