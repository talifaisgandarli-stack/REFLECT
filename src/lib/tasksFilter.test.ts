import { describe, expect, it } from 'vitest';
import { filterTasks } from './tasksFilter';
import type { Task } from '@/types/db';

function task(over: Partial<Task>): Task {
  return {
    id: 'id',
    title: 't',
    description: null,
    status: 'queued',
    project_id: null,
    parent_task_id: null,
    task_level: 0,
    is_expertise_subtask: false,
    assignee_ids: [],
    start_date: null,
    deadline: null,
    estimated_duration: null,
    duration_unit: 'hours',
    risk_buffer_pct: 0,
    workload: null,
    cancel_reason: null,
    archived_at: null,
    created_at: new Date().toISOString(),
    created_by: null,
    ...over,
  } as Task;
}

const ALICE = '11111111';
const BOB = '22222222';
const PROJECT_X = 'proj-x';
const PROJECT_Y = 'proj-y';

describe('filterTasks', () => {
  const all = [
    task({ id: '1', assignee_ids: [ALICE], project_id: PROJECT_X }),
    task({ id: '2', assignee_ids: [BOB], project_id: PROJECT_X }),
    task({ id: '3', assignee_ids: [ALICE, BOB], project_id: PROJECT_Y }),
    task({ id: '4', assignee_ids: [], project_id: null }),
  ];

  it('returns all tasks when no filter is set', () => {
    expect(filterTasks(all, {})).toHaveLength(4);
  });

  it('mineOnly filters by myUserId in assignee_ids', () => {
    expect(
      filterTasks(all, { mineOnly: true, myUserId: ALICE }).map((t) => t.id),
    ).toEqual(['1', '3']);
  });

  it('mineOnly without myUserId is a no-op', () => {
    expect(filterTasks(all, { mineOnly: true })).toHaveLength(4);
  });

  it('assigneeId filters by membership', () => {
    expect(
      filterTasks(all, { assigneeId: BOB }).map((t) => t.id),
    ).toEqual(['2', '3']);
  });

  it('projectId narrows to a single project', () => {
    expect(
      filterTasks(all, { projectId: PROJECT_X }).map((t) => t.id),
    ).toEqual(['1', '2']);
  });

  it('combines mineOnly + projectId with AND', () => {
    expect(
      filterTasks(all, {
        mineOnly: true,
        myUserId: ALICE,
        projectId: PROJECT_X,
      }).map((t) => t.id),
    ).toEqual(['1']);
  });

  it('returns empty when filters intersect to nothing', () => {
    expect(
      filterTasks(all, { assigneeId: ALICE, projectId: 'unknown' }),
    ).toEqual([]);
  });

  it('treats null/undefined filter values as unset', () => {
    expect(
      filterTasks(all, { assigneeId: null, projectId: null, mineOnly: false }),
    ).toHaveLength(4);
  });
});
