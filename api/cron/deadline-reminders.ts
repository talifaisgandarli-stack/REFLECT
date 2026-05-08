/**
 * Daily deadline reminder cron — PRD §8.1 + REQ-TASK.
 *
 * Inserts `deadline_reminder` notifications at D-3, D-1, and D-day for every
 * open task assignee. Idempotent: payload.bucket ('d3' | 'd1' | 'd0') and
 * task_id together form a logical key — we skip if a row already exists for
 * the same task + bucket + user. notify-fanout (0009) then drains the rows
 * to email + Telegram.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type TaskRow = {
  id: string;
  title: string;
  deadline: string | null;
  assignee_ids: string[];
  status: string;
  archived_at: string | null;
};

const TZ = 'Asia/Baku';

function bakuISODate(daysFromToday: number): string {
  // Baku is +04:00 year-round (no DST). Compute the calendar date there.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = new Date(fmt.format(new Date()) + 'T00:00:00+04:00');
  today.setUTCDate(today.getUTCDate() + daysFromToday);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(today);
}

const BUCKETS: Array<{ key: 'd3' | 'd1' | 'd0'; offset: number; label: string }> = [
  { key: 'd3', offset: 3, label: '3 gün qalıb' },
  { key: 'd1', offset: 1, label: 'sabah' },
  { key: 'd0', offset: 0, label: 'bu gün' },
];

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    let inserted = 0;
    let skipped = 0;

    for (const b of BUCKETS) {
      const targetDate = bakuISODate(b.offset);

      const { data: tasks, error } = await sb
        .from('tasks')
        .select('id, title, deadline, assignee_ids, status, archived_at')
        .eq('deadline', targetDate)
        .is('archived_at', null)
        .not('status', 'in', '(done,cancelled)');
      if (error) throw new HttpError(500, error.message);

      const rows = (tasks ?? []) as TaskRow[];
      if (rows.length === 0) continue;

      // Pre-fetch existing reminders for this batch to make the dedupe
      // a single round-trip rather than per-task-per-user.
      const { data: existing } = await sb
        .from('notifications')
        .select('user_id, payload')
        .eq('kind', 'deadline_reminder')
        .in('user_id', Array.from(new Set(rows.flatMap((r) => r.assignee_ids))))
        .gte('created_at', new Date(Date.now() - 36 * 3600 * 1000).toISOString());
      const seen = new Set<string>();
      for (const r of existing ?? []) {
        const p = (r as { user_id: string; payload: Record<string, unknown> }).payload ?? {};
        if (typeof p.task_id === 'string' && typeof p.bucket === 'string') {
          seen.add(`${p.task_id}|${p.bucket}|${(r as { user_id: string }).user_id}`);
        }
      }

      const inserts: Array<{ user_id: string; kind: string; payload: Record<string, unknown> }> = [];
      for (const t of rows) {
        for (const uid of t.assignee_ids ?? []) {
          if (!uid) continue;
          if (seen.has(`${t.id}|${b.key}|${uid}`)) {
            skipped++;
            continue;
          }
          inserts.push({
            user_id: uid,
            kind: 'deadline_reminder',
            payload: {
              task_id: t.id,
              title: t.title,
              deadline: t.deadline,
              bucket: b.key,
              label: b.label,
            },
          });
        }
      }

      if (inserts.length > 0) {
        const { error: insErr } = await sb.from('notifications').insert(inserts);
        if (insErr) throw new HttpError(500, insErr.message);
        inserted += inserts.length;
      }
    }

    return jsonResponse({ ok: true, inserted, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
