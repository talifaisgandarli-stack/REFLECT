/**
 * Per-kind notification body line (slice 101).
 *
 * NotificationBell renders two strings per row: the event KIND label
 * (already i18n via `notif.kind.*`) and the BODY line below it. The body
 * line previously lived inline in NotificationBell and only knew about
 * `p.title`; it ignored the rich payloads (status transitions, RSVP
 * responses, deadline counts) that the DB triggers actually emit.
 *
 * This module owns that rendering. It accepts a translator so the helper
 * stays UI-pure and testable, and falls back to a short task-id stub
 * when the payload is empty (which only happens for hand-crafted rows).
 */
import type { NotificationRow } from '@/lib/hooks';

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function notifBodyFor(n: NotificationRow, t: Translator): string {
  const p = (n.payload ?? {}) as Record<string, unknown>;

  switch (n.kind) {
    case 'task_status_changed':
    case 'task_done':
    case 'task_cancelled': {
      const title = asString(p.title);
      const to = asString(p.to);
      if (title && to) {
        return t('notif.body.task_transition', {
          title,
          status: t(`task.status.${to}`),
        });
      }
      return title ?? '';
    }
    case 'deadline_reminder': {
      const title = asString(p.title);
      const days = asNumber(p.days_left);
      if (title && days != null) {
        return t('notif.body.deadline', { title, days });
      }
      return title ?? '';
    }
    case 'calendar_event_rsvp': {
      const title = asString(p.event_title);
      const status = asString(p.status);
      if (title && status) {
        return t('notif.body.rsvp', {
          title,
          status: t(`notif.body.rsvp.${status}`),
        });
      }
      return title ?? '';
    }
    case 'finance_alert':
    case 'mention':
    case 'task_assigned':
    default: {
      const title = asString(p.title) ?? asString(p.event_title);
      if (title) return title;
      const taskId = asString(p.task_id);
      if (taskId) return t('notif.body.task_stub', { id: taskId.slice(0, 8) });
      return '';
    }
  }
}
