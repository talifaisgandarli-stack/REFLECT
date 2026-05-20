import { describe, it, expect } from 'vitest';
import { sortTasks } from './taskSort';
import type { Task } from '@/types/db';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    project_id: null,
    title: 'Title',
    description: null,
    status: 'queued',
    parent_task_id: null,
    task_level: 0,
    assignee_ids: [],
    start_date: null,
    deadline: null,
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
    ...overrides,
  };
}

describe('sortTasks deadline (default)', () => {
  it('orders ascending with nulls last', () => {
    const tasks = [
      makeTask({ title: 'no-deadline', deadline: null }),
      makeTask({ title: 'may-25', deadline: '2026-05-25' }),
      makeTask({ title: 'may-20', deadline: '2026-05-20' }),
      makeTask({ title: 'no-deadline-2', deadline: null }),
    ];
    const out = sortTasks(tasks, 'deadline');
    expect(out.map((t) => t.title)).toEqual([
      'may-20',
      'may-25',
      'no-deadline',
      'no-deadline-2',
    ]);
  });

  it('does not mutate the input array', () => {
    const tasks = [
      makeTask({ title: 'B', deadline: '2026-05-25' }),
      makeTask({ title: 'A', deadline: '2026-05-20' }),
    ];
    const snapshot = tasks.map((t) => t.title);
    sortTasks(tasks, 'deadline');
    expect(tasks.map((t) => t.title)).toEqual(snapshot);
  });
});

describe('sortTasks priority', () => {
  it('orders high > medium > low/normal/null, then by deadline', () => {
    const tasks = [
      makeTask({ title: 'low-may-20', priority: 'low', deadline: '2026-05-20' }),
      makeTask({ title: 'high-may-25', priority: 'high', deadline: '2026-05-25' }),
      makeTask({ title: 'medium-may-21', priority: 'medium', deadline: '2026-05-21' }),
      makeTask({ title: 'high-may-22', priority: 'high', deadline: '2026-05-22' }),
      makeTask({ title: 'null-may-19', priority: null, deadline: '2026-05-19' }),
    ];
    const out = sortTasks(tasks, 'priority');
    expect(out.map((t) => t.title)).toEqual([
      'high-may-22',  // high, earlier deadline within same priority
      'high-may-25',
      'medium-may-21',
      'null-may-19',  // null collapses into 'normal' bucket (2), ties to low
      'low-may-20',
    ]);
  });

  it('treats null priority as normal (tie-breaks to deadline order)', () => {
    const tasks = [
      makeTask({ title: 'normal-late', priority: null, deadline: '2026-06-01' }),
      makeTask({ title: 'low-early', priority: 'low', deadline: '2026-05-01' }),
    ];
    const out = sortTasks(tasks, 'priority');
    expect(out.map((t) => t.title)).toEqual(['low-early', 'normal-late']);
  });
});

describe('sortTasks created', () => {
  it('orders newest first', () => {
    const tasks = [
      makeTask({ title: 'old', created_at: '2026-01-01T00:00:00Z' }),
      makeTask({ title: 'new', created_at: '2026-05-01T00:00:00Z' }),
      makeTask({ title: 'mid', created_at: '2026-03-01T00:00:00Z' }),
    ];
    const out = sortTasks(tasks, 'created');
    expect(out.map((t) => t.title)).toEqual(['new', 'mid', 'old']);
  });
});
