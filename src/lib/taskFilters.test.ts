import { describe, it, expect } from 'vitest';
import { filterTasks } from './taskFilters';
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

const NO_FILTER = {
  labelFilter: null,
  projectFilter: '',
  todayOnly: false,
  todayStr: '2026-05-20',
  search: '',
};

describe('filterTasks', () => {
  it('returns all tasks when no filter is active', () => {
    const tasks = [makeTask({ title: 'A' }), makeTask({ title: 'B' })];
    expect(filterTasks(tasks, NO_FILTER)).toHaveLength(2);
  });

  it('narrows by label filter', () => {
    const tasks = [
      makeTask({ title: 'A', labels: ['bug'] }),
      makeTask({ title: 'B', labels: ['feature'] }),
      makeTask({ title: 'C', labels: ['bug', 'urgent'] }),
    ];
    const out = filterTasks(tasks, { ...NO_FILTER, labelFilter: 'bug' });
    expect(out.map((t) => t.title)).toEqual(['A', 'C']);
  });

  it('label filter handles null labels safely', () => {
    const tasks = [
      makeTask({ title: 'A', labels: undefined as unknown as string[] }),
      makeTask({ title: 'B', labels: ['bug'] }),
    ];
    const out = filterTasks(tasks, { ...NO_FILTER, labelFilter: 'bug' });
    expect(out.map((t) => t.title)).toEqual(['B']);
  });

  it('narrows by project', () => {
    const tasks = [
      makeTask({ title: 'A', project_id: 'p1' }),
      makeTask({ title: 'B', project_id: 'p2' }),
      makeTask({ title: 'C', project_id: 'p1' }),
    ];
    const out = filterTasks(tasks, { ...NO_FILTER, projectFilter: 'p1' });
    expect(out.map((t) => t.title)).toEqual(['A', 'C']);
  });

  it('narrows by todayOnly using todayStr', () => {
    const tasks = [
      makeTask({ title: 'today-a', deadline: '2026-05-20' }),
      makeTask({ title: 'tomorrow', deadline: '2026-05-21' }),
      makeTask({ title: 'today-b', deadline: '2026-05-20' }),
      makeTask({ title: 'no-deadline', deadline: null }),
    ];
    const out = filterTasks(tasks, { ...NO_FILTER, todayOnly: true, todayStr: '2026-05-20' });
    expect(out.map((t) => t.title)).toEqual(['today-a', 'today-b']);
  });

  it('narrows by search (case-insensitive, trimmed substring)', () => {
    const tasks = [
      makeTask({ title: 'Loqo dizaynı' }),
      makeTask({ title: 'Anbar yenilənməsi' }),
      makeTask({ title: 'loqo PDF' }),
    ];
    const out = filterTasks(tasks, { ...NO_FILTER, search: '  LOQO  ' });
    expect(out.map((t) => t.title)).toEqual(['Loqo dizaynı', 'loqo PDF']);
  });

  it('empty / whitespace-only search is a no-op', () => {
    const tasks = [makeTask({ title: 'A' }), makeTask({ title: 'B' })];
    expect(filterTasks(tasks, { ...NO_FILTER, search: '   ' })).toHaveLength(2);
  });

  it('combines filters with AND semantics', () => {
    const tasks = [
      makeTask({ title: 'logo design', labels: ['design'], project_id: 'p1', deadline: '2026-05-20' }),
      makeTask({ title: 'logo pdf', labels: ['design'], project_id: 'p2', deadline: '2026-05-20' }),
      makeTask({ title: 'bug fix', labels: ['bug'], project_id: 'p1', deadline: '2026-05-20' }),
    ];
    const out = filterTasks(tasks, {
      labelFilter: 'design',
      projectFilter: 'p1',
      todayOnly: true,
      todayStr: '2026-05-20',
      search: 'logo',
    });
    expect(out.map((t) => t.title)).toEqual(['logo design']);
  });
});
