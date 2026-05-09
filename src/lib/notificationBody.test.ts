import { describe, expect, it } from 'vitest';
import { notifBodyFor } from './notificationBody';
import type { NotificationRow } from './hooks';

const t = (k: string, vars?: Record<string, string | number>): string => {
  const dict: Record<string, string> = {
    'task.status.done': 'Done',
    'task.status.review': 'Review',
    'notif.body.task_transition': '{title} → {status}',
    'notif.body.deadline': '{title} ({days}d left)',
    'notif.body.rsvp': '{title} · {status}',
    'notif.body.rsvp.yes': 'yes',
    'notif.body.rsvp.no': 'no',
    'notif.body.task_stub': 'Task #{id}',
  };
  const raw = dict[k] ?? k;
  return raw.replace(/\{(\w+)\}/g, (m, key) =>
    vars && key in vars ? String(vars[key]) : m,
  );
};

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    user_id: 'u1',
    kind: 'mention',
    payload: {},
    read_at: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe('notifBodyFor', () => {
  it('returns the task title for a mention', () => {
    expect(notifBodyFor(row({ kind: 'mention', payload: { title: 'Brief' } }), t)).toBe(
      'Brief',
    );
  });

  it('renders a status transition with the localized status name', () => {
    expect(
      notifBodyFor(
        row({
          kind: 'task_status_changed',
          payload: { title: 'Brief', to: 'done', from: 'review' },
        }),
        t,
      ),
    ).toBe('Brief → Done');
  });

  it('renders deadline reminders with day count', () => {
    expect(
      notifBodyFor(
        row({
          kind: 'deadline_reminder',
          payload: { title: 'Brief', days_left: 3 },
        }),
        t,
      ),
    ).toBe('Brief (3d left)');
  });

  it('renders RSVP responses with the localized status', () => {
    expect(
      notifBodyFor(
        row({
          kind: 'calendar_event_rsvp',
          payload: { event_title: 'Sprint review', status: 'yes' },
        }),
        t,
      ),
    ).toBe('Sprint review · yes');
  });

  it('falls back to a task-id stub when title is missing', () => {
    expect(
      notifBodyFor(
        row({
          kind: 'task_assigned',
          payload: { task_id: '12345678-aaaa-bbbb-cccc-ddddeeeeffff' },
        }),
        t,
      ),
    ).toBe('Task #12345678');
  });

  it('returns empty string when payload has no title and no task_id', () => {
    expect(notifBodyFor(row({ kind: 'mention', payload: {} }), t)).toBe('');
  });

  it('handles malformed transition payloads by returning the title', () => {
    expect(
      notifBodyFor(
        row({
          kind: 'task_status_changed',
          payload: { title: 'Brief' },
        }),
        t,
      ),
    ).toBe('Brief');
  });
});
