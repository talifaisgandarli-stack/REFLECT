/**
 * REQ-TASK-07: Post a task comment, parse @userId mentions server-side,
 * populate mentions[], and notify mentioned users (in-app + Telegram if linked).
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser, rateLimit } from '../_lib/auth';

export const config = { runtime: 'edge' };

// Matches @<uuid-v4> in comment body (REQ-TASK-07: "@userId format").
const MENTION_RE = /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function parseMentions(body: string): string[] {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const id = m[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const user = await requireUser(req);
    await rateLimit(user, user.id);
    const body = await req.json().catch(() => null);
    const taskId = body?.task_id as string | undefined;
    const text = body?.body as string | undefined;

    if (!taskId || typeof taskId !== 'string') throw new HttpError(400, 'task_id tələb olunur');
    if (!text || typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'body tələb olunur');
    if (text.length > 4000) throw new HttpError(400, 'Maksimum 4000 simvol');

    const sb = admin();

    // Verify task exists (RLS does not apply server-side, so we confirm the row exists).
    const { data: task } = await sb.from('tasks').select('id, title').eq('id', taskId).maybeSingle();
    if (!task) throw new HttpError(404, 'Tapşırıq tapılmadı');

    const mentions = parseMentions(text);

    // Insert comment
    const { data: comment, error: ce } = await sb.from('task_comments').insert({
      task_id: taskId,
      user_id: user.id,
      body: text.trim(),
      mentions,
    }).select('id').single();
    if (ce) throw ce;

    // Notify mentioned users — skip the author themselves
    const targets = mentions.filter((id) => id !== user.id);
    if (targets.length > 0) {
      // Resolve profiles (full_name + telegram_chat_id) for targets
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, full_name, telegram_chat_id')
        .in('id', targets);

      // Insert in-app notifications
      const notifRows = (profiles ?? []).map((p) => ({
        user_id: p.id,
        type: 'mention',
        payload: { task_id: taskId, task_title: task.title, comment_id: comment.id, actor_id: user.id },
        read: false,
      }));
      if (notifRows.length > 0) {
        await sb.from('notifications').insert(notifRows);
      }

      // Telegram notifications for users who have linked their account
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const telegramTargets = (profiles ?? []).filter((p) => p.telegram_chat_id);
        for (const p of telegramTargets) {
          const msg = `📌 Sizi qeyd etdilər: «${task.title}»\n${text.trim().slice(0, 200)}`;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: p.telegram_chat_id, text: msg }),
          }).catch(() => null); // best-effort
        }
      }
    }

    return jsonResponse({ ok: true, comment_id: comment.id, mentions });
  } catch (e) {
    return errorResponse(e);
  }
}
