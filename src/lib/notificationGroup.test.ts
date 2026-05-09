import { describe, expect, it } from 'vitest';
import { collapse, GROUP_THRESHOLD } from './notificationGroup';
import type { NotificationRow } from './hooks';

let nextId = 0;
function row(kind: string, read = false): NotificationRow {
  return {
    id: `n-${nextId++}`,
    user_id: 'user-1',
    kind,
    payload: {},
    read_at: read ? '2026-01-01T00:00:00Z' : null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('collapse()', () => {
  it('returns an empty array for empty input', () => {
    expect(collapse([])).toEqual([]);
  });

  it('passes through a single row as a single', () => {
    const out = collapse([row('mention')]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('single');
  });

  it('keeps two same-kind unreads as singles (under threshold)', () => {
    const out = collapse([row('task_status_changed'), row('task_status_changed')]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.kind === 'single')).toBe(true);
  });

  it('collapses three+ same-kind unreads into a group', () => {
    const a = row('task_status_changed');
    const b = row('task_status_changed');
    const c = row('task_status_changed');
    const out = collapse([a, b, c]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('group');
    if (out[0].kind === 'group') {
      expect(out[0].rows).toHaveLength(3);
      expect(out[0].leader.id).toBe(a.id);
    }
  });

  it('always passes read rows through individually', () => {
    const out = collapse([row('task_done', true), row('task_done', true), row('task_done', true)]);
    expect(out.every((g) => g.kind === 'single')).toBe(true);
    expect(out).toHaveLength(3);
  });

  it('breaks a run when a read row interrupts', () => {
    const out = collapse([
      row('task_status_changed'), // unread
      row('task_status_changed'), // unread
      row('task_status_changed', true), // read — breaks the run
      row('task_status_changed'), // unread (new run starts here, length 1)
    ]);
    // 2 + 1(read) + 1 = 4 individual entries, no groups (no run hit threshold)
    expect(out).toHaveLength(4);
    expect(out.every((g) => g.kind === 'single')).toBe(true);
  });

  it('breaks a run on a different kind', () => {
    const out = collapse([
      row('task_status_changed'),
      row('task_status_changed'),
      row('mention'),
      row('task_status_changed'),
      row('task_status_changed'),
      row('task_status_changed'), // 3 in a row → group
    ]);
    // First two and the mention pass as singles; last three collapse.
    expect(out).toHaveLength(4);
    expect(out[0].kind).toBe('single');
    expect(out[1].kind).toBe('single');
    expect(out[2].kind).toBe('single');
    expect(out[3].kind).toBe('group');
  });

  it('threshold value is 3', () => {
    expect(GROUP_THRESHOLD).toBe(3);
  });
});
