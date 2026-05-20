import { describe, it, expect } from 'vitest';
import { taskTimeGroup } from './TaskPersonalList';
import type { Task } from '@/types/db';

function task(deadline: string | null): Task {
  return {
    id: 'id',
    project_id: null,
    title: 'T',
    description: null,
    status: 'queued',
    parent_task_id: null,
    task_level: 0,
    assignee_ids: [],
    start_date: null,
    deadline,
    estimated_duration: null,
    duration_unit: null,
    risk_buffer_pct: 0,
    is_expertise_subtask: false,
    workload: null,
    workload_calculated_at: null,
    cancel_reason: null,
    archived_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    labels: [],
    priority: null,
  };
}

const TODAY = '2026-05-20';
const END_OF_WEEK = '2026-05-24'; // upcoming Sunday

describe('taskTimeGroup', () => {
  it('buckets tasks with no deadline as "none"', () => {
    expect(taskTimeGroup(task(null), TODAY, END_OF_WEEK)).toBe('none');
  });

  it('buckets past deadlines as "overdue"', () => {
    expect(taskTimeGroup(task('2026-05-19'), TODAY, END_OF_WEEK)).toBe('overdue');
    expect(taskTimeGroup(task('2025-12-31'), TODAY, END_OF_WEEK)).toBe('overdue');
  });

  it('buckets exactly-today deadlines as "today"', () => {
    expect(taskTimeGroup(task('2026-05-20'), TODAY, END_OF_WEEK)).toBe('today');
  });

  it('buckets deadlines within this week as "week"', () => {
    expect(taskTimeGroup(task('2026-05-22'), TODAY, END_OF_WEEK)).toBe('week');
    // The week-end day itself counts as "week" (inclusive of Sunday)
    expect(taskTimeGroup(task('2026-05-24'), TODAY, END_OF_WEEK)).toBe('week');
  });

  it('buckets deadlines past the week as "later"', () => {
    expect(taskTimeGroup(task('2026-05-25'), TODAY, END_OF_WEEK)).toBe('later');
    expect(taskTimeGroup(task('2026-12-31'), TODAY, END_OF_WEEK)).toBe('later');
  });
});
