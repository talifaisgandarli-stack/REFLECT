/**
 * US-TG-02 — daily task deadline reminders.
 * US-CONTENT-01 — content_plans D-2 reminder (§9.3).
 *
 * Cron fires 09:00 Asia/Baku (= 05:00 UTC). For each task/plan with a
 * deadline we send to every assignee/owner whose Telegram is linked AND
 * whose notification_preferences allow the relevant channel+event.
 *
 * Reminder windows:
 *   tasks       — D-3, D-1, D-0 (calendar dates in Asia/Baku)
 *   content_plans — D-2 only (PRD §9.3 / US-CONTENT-01)
 *
 * Idempotency: every send is logged to notification_log with a
 * deterministic key via notif_log_key(). Reruns within the same UTC day
 * (or any day) skip already-sent (entity, user, date) combos.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { sendTelegramMessage } from '../_lib/telegram';

export const config = { runtime: 'edge' };

type Task = {
  id: string;
  title: string;
  deadline: string;
  assignee_ids: string[];
  project_id: string | null;
};
type ContentPlan = {
  id: string;
  title: string;
  scheduled_at: string; // DATE
  owner_id: string | null;
  channel: string | null;
};
type Profile = {
  id: string;
  telegram_chat_id: string | null;
};
type Project = { id: string; name: string };

function bakuToday(): string {
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
    const taskTargets = [
      { date: today,              label: 'bu gün' },
      { date: addDays(today, 1),  label: 'sabah' },
      { date: addDays(today, 3),  label: '3 gündən sonra' },
    ];
    const contentD2 = addDays(today, 2);

    // ── 1. Tasks ───────────────────────────────────────────────────────────
    const { data: tasks, error: tasksErr } = await sb
      .from('tasks')
      .select('id, title, deadline, assignee_ids, project_id')
      .in('deadline', taskTargets.map((t) => t.date))
      .is('archived_at', null);
    if (tasksErr) throw new HttpError(500, tasksErr.message);

    // ── 2. Content plans (D-2 only) ────────────────────────────────────────
    const { data: plans, error: plansErr } = await sb
      .from('content_plans')
      .select('id, title, scheduled_at, owner_id, channel')
      .eq('scheduled_at', contentD2)
      .not('status', 'eq', 'published');
    if (plansErr) throw new HttpError(500, plansErr.message);

    if (
      (!tasks || tasks.length === 0) &&
      (!plans || plans.length === 0)
    ) {
      return jsonResponse({ ok: true, sent: 0, considered: 0 });
    }

    // ── Resolve profiles ───────────────────────────────────────────────────
    const assigneeIds = Array.from(
      new Set([
        ...((tasks ?? []) as Task[]).flatMap((t) => t.assignee_ids ?? []),
        ...((plans ?? []) as ContentPlan[])
          .map((p) => p.owner_id)
          .filter((x): x is string => !!x),
      ]),
    );
    const projectIds = Array.from(
      new Set(
        ((tasks ?? []) as Task[]).map((t) => t.project_id).filter((x): x is string => !!x),
      ),
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

    const profileById = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));
    const projectName = new Map(((projects ?? []) as Project[]).map((p) => [p.id, p.name]));

    // ── Pre-fetch notification_log keys we'll need ─────────────────────────
    // Build all candidate log keys first so we can batch-query.
    type PendingItem = {
      logKey: string;
      userId: string;
      chatId: string;
      text: string;
      prefEvent: string;
    };
    const pending: PendingItem[] = [];

    for (const t of (tasks ?? []) as Task[]) {
      const target = taskTargets.find((x) => x.date === t.deadline);
      if (!target) continue;
      for (const uid of t.assignee_ids ?? []) {
        const prof = profileById.get(uid);
        if (!prof?.telegram_chat_id) continue;
        const projLabel = t.project_id ? projectName.get(t.project_id) ?? '' : '';
        const text =
          `📋 ${t.title} — deadline ${target.label} (${t.deadline})` +
          (projLabel ? ` [${projLabel}]` : '');
        pending.push({
          logKey: `task:${t.id}:${uid}:${target.date}`,
          userId: uid,
          chatId: prof.telegram_chat_id,
          text,
          prefEvent: 'task_deadline',
        });
      }
    }

    for (const plan of (plans ?? []) as ContentPlan[]) {
      if (!plan.owner_id) continue;
      const prof = profileById.get(plan.owner_id);
      if (!prof?.telegram_chat_id) continue;
      const channelLabel = plan.channel ? ` [${plan.channel}]` : '';
      const text = `📅 Məzmun planı: "${plan.title}"${channelLabel} — 2 gün sonra (${plan.scheduled_at})`;
      pending.push({
        logKey: `content:${plan.id}:${plan.owner_id}:${contentD2}`,
        userId: plan.owner_id,
        chatId: prof.telegram_chat_id,
        text,
        prefEvent: 'task_deadline', // reuse — no separate content pref in v1
      });
    }

    if (pending.length === 0) {
      return jsonResponse({ ok: true, sent: 0, considered: 0 });
    }

    // Resolve log keys to UUIDs via notif_log_key() and batch-check sent set.
    const keyUuids: Record<string, string> = {};
    for (const item of pending) {
      const { data: kv } = await sb.rpc('notif_log_key', { p_key: item.logKey });
      if (kv) keyUuids[item.logKey] = kv as string;
    }
    const uuidList = Object.values(keyUuids);
    let sentSet = new Set<string>();
    if (uuidList.length > 0) {
      const { data: alreadySent } = await sb
        .from('notification_log')
        .select('notification_id')
        .eq('channel', 'telegram')
        .in('notification_id', uuidList);
      sentSet = new Set(
        ((alreadySent ?? []) as { notification_id: string }[]).map((r) => r.notification_id),
      );
    }

    let sent = 0;
    const newLogs: { notification_id: string; channel: string }[] = [];

    for (const item of pending) {
      const uuid = keyUuids[item.logKey];
      if (!uuid || sentSet.has(uuid)) continue;

      const { data: enabled } = await sb.rpc('notif_pref_enabled', {
        p_user: item.userId,
        p_channel: 'telegram',
        p_event: item.prefEvent,
      });
      if (enabled === false) continue;

      const r = await sendTelegramMessage(item.chatId, item.text);
      if (r.ok) {
        newLogs.push({ notification_id: uuid, channel: 'telegram' });
        sent += 1;
      }
    }

    if (newLogs.length > 0) {
      await sb.from('notification_log').insert(newLogs);
    }

    return jsonResponse({ ok: true, sent, considered: pending.length });
  } catch (e) {
    return errorResponse(e);
  }
}
