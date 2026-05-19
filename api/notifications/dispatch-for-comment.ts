/**
 * PRD §REQ-TASK-07 — instant Telegram delivery for @mentions on comment
 * insert/edit. The daily notify-fanout cron is the durable backstop; this
 * endpoint is the realtime path so a mentioned teammate sees the Telegram
 * message within seconds, not up to 24 h later.
 *
 * Trust model:
 *  - Caller authenticates with their JWT (requireUser).
 *  - Caller passes commentId; we verify they authored that comment via the
 *    RLS-scoped client (anyone tampering hits RLS or the user_id check).
 *  - Then dispatch any notifications whose payload.comment_id matches and
 *    whose telegram channel hasn't already been stamped. Idempotent by the
 *    same dispatched_channels.telegram check used by the cron.
 *
 * Hobby plan: Vercel limits crons to once per day, so the cron alone misses
 * the SLA. This endpoint sidesteps that by being request-scoped.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser, userClient } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

type NotifRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  dispatched_channels: Record<string, string>;
};

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.ok;
}

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { commentId?: unknown };
    const commentId = typeof body.commentId === 'string' ? body.commentId : '';
    if (!commentId) throw new HttpError(400, 'commentId required');

    // RLS-scoped read to verify caller authored the comment. If the row isn't
    // visible or user_id mismatches, we treat as not-authored and refuse.
    const sbUser = userClient(user.token);
    const { data: comment } = await sbUser
      .from('task_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .maybeSingle();
    if (!comment || comment.user_id !== user.id) {
      throw new HttpError(403, 'Not the comment author');
    }

    // From here on use service role so we can read recipient profiles + preferences
    // (those aren't readable cross-user under RLS).
    const sb = admin();
    const { data: notifsRaw, error } = await sb
      .from('notifications')
      .select('id, user_id, kind, payload, dispatched_channels')
      .eq('kind', 'mention')
      .contains('payload', { comment_id: commentId });
    if (error) throw new HttpError(500, error.message);
    const notifs = (notifsRaw ?? []) as NotifRow[];
    const pending = notifs.filter((n) => !n.dispatched_channels?.telegram);
    if (pending.length === 0) return jsonResponse({ ok: true, dispatched: 0 });

    const userIds = Array.from(new Set(pending.map((n) => n.user_id)));
    const { data: profilesRaw } = await sb
      .from('profiles')
      .select('id, full_name, telegram_chat_id')
      .in('id', userIds);
    const profMap = new Map<string, { telegram_chat_id: string | null }>();
    for (const p of (profilesRaw ?? []) as Array<{ id: string; telegram_chat_id: string | null }>) {
      profMap.set(p.id, p);
    }

    // Opt-out model: row missing = enabled.
    const { data: prefsRaw } = await sb
      .from('notification_preferences')
      .select('user_id, channel, event_kind, enabled')
      .in('user_id', userIds)
      .eq('channel', 'telegram')
      .eq('event_kind', 'mention');
    const disabled = new Set<string>();
    for (const r of (prefsRaw ?? []) as Array<{ user_id: string; enabled: boolean }>) {
      if (r.enabled === false) disabled.add(r.user_id);
    }

    let dispatched = 0;
    const subject = 'Sənə müraciət';
    for (const n of pending) {
      const prof = profMap.get(n.user_id);
      if (!prof?.telegram_chat_id) continue;
      if (disabled.has(n.user_id)) continue;
      const p = n.payload ?? {};
      const title = typeof p.title === 'string' ? p.title : '';
      const text = `${subject}${title ? `\n\n${title}` : ''}`;
      const ok = await sendTelegram(prof.telegram_chat_id, text);
      if (ok) {
        const merged = { ...(n.dispatched_channels ?? {}), telegram: new Date().toISOString() };
        await sb.from('notifications').update({ dispatched_channels: merged }).eq('id', n.id);
        dispatched++;
      }
    }
    return jsonResponse({ ok: true, dispatched, candidates: pending.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'notifications/dispatch-for-comment');
