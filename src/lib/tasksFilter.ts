/**
 * Pure filter logic for the kanban + table views (slice 153).
 *
 * The page already filters "mine" via assignee_ids.includes(profile.id).
 * This helper extends that with optional project + assignee constraints
 * so the same predicate works in unit tests and in the rendered list.
 */
import type { Task } from '@/types/db';

export type TaskFilter = {
  /** profile id; if set, only tasks where this user is in assignee_ids. */
  assigneeId?: string | null;
  /** project id; if set, only tasks belonging to that project. */
  projectId?: string | null;
  /** if true, show only tasks where myUserId is assigned. */
  mineOnly?: boolean;
  /** profile id used to resolve mineOnly. */
  myUserId?: string | null;
};

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  return tasks.filter((task) => {
    if (filter.mineOnly && filter.myUserId) {
      const ids = task.assignee_ids ?? [];
      if (!ids.includes(filter.myUserId)) return false;
    }
    if (filter.assigneeId) {
      const ids = task.assignee_ids ?? [];
      if (!ids.includes(filter.assigneeId)) return false;
    }
    if (filter.projectId) {
      if (task.project_id !== filter.projectId) return false;
    }
    return true;
  });
}
