/**
 * US-TG-02 — daily task deadline reminders.
 *
 * Cron fires 09:00 Asia/Baku (= 05:00 UTC). For each task with a deadline,
 * we send to every assignee whose Telegram is linked AND whose
 * notification_preferences allow channel='telegram', event='task_deadline'.
 *
 * Reminder windows: D-3, D-1, D — calendar dates in Asia/Baku.
 *
 * Idempotency: we don't track "sent" state per (task, user, day) yet — the
 * cron runs once per day at a fixed UTC time, so a rerun within the same
 * UTC day would re-notify. Acceptable for v1; the upgrade path is a small
 * `notification_log (kind, key, sent_at)` table, similar to
 * expenses_recurring_unique. Logged as a TODO.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { sendTelegramMessage } from '../_lib/telegram';

export const config = { runtime: 'edge' };

type Task = {
  id: string;
  title: string;
  deadline: string; // YYYY-MM-DD (DATE)
  assignee_ids: string[];
  project_id: string | null;
};
type Profile = {
  id: string;
  telegram_chat_id: string | null;
};
type Project = { id: string; name: string };

function bakuToday(): string {
  // PRD §6.7: Asia/Baku for date math. Baku is UTC+4 with no DST.
  const now = new Date();
  const baku = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return baku.toISOString().slice(0, 10);
}

function addDays(yyyyMmDd: string, days: number): string {
  const d = new Date(yyyyMmDd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const today = bakuToday();
    const targets = [
      { date: today, label: 'bu gün' },
      { date: addDays(today, 1), label: 'sabah' },
      { date: addDays(today, 3), label: '3 gündən sonra' },
    ];

    const { data: tasks, error: tasksErr } = await sb
      .from('tasks')
      .select('id, title, deadline, assignee_ids, project_id')
      .in(
        'deadline',
        targets.map((t) => t.date),
      )
      .is('archived_at', null);
    if (tasksErr) throw new HttpError(500, tasksErr.message);

    if (!tasks || tasks.length === 0) {
      return jsonResponse({ ok: true, sent: 0, considered: 0 });
    }

    const assigneeIds = Array.from(
      new Set((tasks as Task[]).flatMap((t) => t.assignee_ids ?? [])),
    );
    const projectIds = Array.from(
      new Set((tasks as Task[]).map((t) => t.project_id).filter((x): x is string => !!x)),
    );

    const [{ data: profiles }, { data: projects }] = await Promise.all([
      sb
        .from('profiles')
        .select('id, telegram_chat_id')
        .in('id', assigneeIds)
        .not('telegram_chat_id', 'is', null),
      projectIds.length > 0
        ? sb.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [] as Project[] }),
    ]);

    const profileById = new Map((profiles ?? []).map((p: Profile) => [p.id, p]));
    const projectName = new Map((projects ?? []).map((p: Project) => [p.id, p.name]));

    let sent = 0;
    for (const t of tasks as Task[]) {
      const target = targets.find((x) => x.date === t.deadline);
      if (!target) continue;
      for (const uid of t.assignee_ids ?? []) {
        const prof = profileById.get(uid);
        if (!prof?.telegram_chat_id) continue;

        const { data: enabled } = await sb.rpc('notif_pref_enabled', {
          p_user: uid,
          p_channel: 'telegram',
          p_event: 'task_deadline',
        });
        if (enabled === false) continue;

        const projLabel = t.project_id ? projectName.get(t.project_id) ?? '' : '';
        const text =
          `📋 ${t.title} — deadline ${target.label} (${t.deadline})` +
          (projLabel ? ` [${projLabel}]` : '');
        const r = await sendTelegramMessage(prof.telegram_chat_id, text);
        if (r.ok) sent += 1;
      }
    }

    return jsonResponse({ ok: true, sent, considered: tasks.length });
  } catch (e) {
    return errorResponse(e);
  }
}
