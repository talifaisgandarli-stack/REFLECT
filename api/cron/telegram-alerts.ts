/**
 * US-TG-03 — drain telegram_alert_queue (finance alerts, admin-only).
 * Mention fan-out — drain pending mention notifications to mentioned
 *   users who have telegram linked + pref enabled.
 *
 * DB triggers on incomes/expenses (migration 0010) push rows into
 * telegram_alert_queue when amount >= the configured threshold. This cron
 * fans them out to every admin whose Telegram is linked and whose
 * notification_preferences allow channel='telegram', event='finance_alert'.
 *
 * "All financial Telegram messages route ONLY to admin chat IDs." — §8.1.
 * We enforce that by filtering profiles via roles.is_admin = true.
 *
 * Mention Telegram fan-out: reads unread notifications of kind='mention'
 * that have not yet been dispatched (checked via notification_log), sends
 * the mentioned user a Telegram message, then writes to notification_log so
 * reruns are idempotent.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { sendTelegramMessage } from '../_lib/telegram';

export const config = { runtime: 'edge' };

type QueueRow = {
  id: string;
  kind: 'income' | 'expense' | 'overdue_receivable';
  payload: { amount?: number; project_id?: string | null; occurred_at?: string };
};
type AdminProfile = { id: string; telegram_chat_id: string | null };
type Project = { id: string; name: string };
type MentionNotification = {
  id: string;
  user_id: string;
  payload: {
    task_id?: string;
    comment_id?: string;
    by?: string;
    preview?: string;
  };
};
type Profile = { id: string; telegram_chat_id: string | null; full_name: string | null };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();

    // ── 1. Finance alerts (US-TG-03) ──────────────────────────────────────
    const { data: queue, error } = await sb
      .from('telegram_alert_queue')
      .select('id, kind, payload')
      .is('sent_at', null)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new HttpError(500, error.message);

    let financeDrained = 0;
    if (queue && queue.length > 0) {
      const { data: roles } = await sb.from('roles').select('id').eq('is_admin', true);
      const adminRoleIds = (roles ?? []).map((r: { id: string }) => r.id);
      const { data: admins } = await sb
        .from('profiles')
        .select('id, telegram_chat_id, role_id, is_creator')
        .or(
          `is_creator.eq.true${
            adminRoleIds.length > 0 ? `,role_id.in.(${adminRoleIds.join(',')})` : ''
          }`,
        )
        .not('telegram_chat_id', 'is', null);

      const recipients = (admins ?? []) as AdminProfile[];

      const projectIds = Array.from(
        new Set(
          (queue as QueueRow[])
            .map((q) => q.payload.project_id ?? null)
            .filter((x): x is string => !!x),
        ),
      );
      const projectNameById = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projs } = await sb
          .from('projects')
          .select('id, name')
          .in('id', projectIds);
        for (const p of (projs ?? []) as Project[]) projectNameById.set(p.id, p.name);
      }

      const sentIds: string[] = [];
      for (const row of queue as QueueRow[]) {
        const projLabel = row.payload.project_id
          ? projectNameById.get(row.payload.project_id) ?? ''
          : '';
        const symbol = row.kind === 'income' ? '💰 Gəlir' : '💸 Xərc';
        const text =
          `${symbol}: ${formatAmount(row.payload.amount ?? 0)} AZN` +
          (projLabel ? ` · ${projLabel}` : '') +
          (row.payload.occurred_at ? `\n${row.payload.occurred_at}` : '');

        let allOk = true;
        for (const r of recipients) {
          if (!r.telegram_chat_id) continue;
          const { data: enabled } = await sb.rpc('notif_pref_enabled', {
            p_user: r.id,
            p_channel: 'telegram',
            p_event: 'finance_alert',
          });
          if (enabled === false) continue;
          const out = await sendTelegramMessage(r.telegram_chat_id, text);
          if (!out.ok) allOk = false;
        }
        if (allOk) sentIds.push(row.id);
      }

      if (sentIds.length > 0) {
        await sb
          .from('telegram_alert_queue')
          .update({ sent_at: new Date().toISOString() })
          .in('id', sentIds);
      }
      financeDrained = sentIds.length;
    }

    // ── 2. Mention Telegram fan-out ────────────────────────────────────────
    // Fetch unread mention notifications (no read_at filter — we use
    // notification_log to dedupe instead of relying on read_at, since reading
    // in-app shouldn't suppress Telegram).
    const { data: mentions, error: mErr } = await sb
      .from('notifications')
      .select('id, user_id, payload')
      .eq('kind', 'mention')
      .order('created_at', { ascending: true })
      .limit(200);
    if (mErr) throw new HttpError(500, mErr.message);

    let mentionSent = 0;
    if (mentions && mentions.length > 0) {
      // Batch-fetch already-logged notification_ids to avoid per-row queries.
      const mentionIds = (mentions as MentionNotification[]).map((m) => m.id);
      const { data: alreadySent } = await sb
        .from('notification_log')
        .select('notification_id')
        .eq('channel', 'telegram')
        .in('notification_id', mentionIds);
      const sentSet = new Set(
        (alreadySent ?? []).map((r: { notification_id: string }) => r.notification_id),
      );

      // Resolve profiles for the mentioned users (and the sender full_name).
      const userIds = Array.from(
        new Set([
          ...(mentions as MentionNotification[]).map((m) => m.user_id),
          ...(mentions as MentionNotification[])
            .map((m) => m.payload.by)
            .filter((x): x is string => !!x),
        ]),
      );
      const { data: profileRows } = await sb
        .from('profiles')
        .select('id, telegram_chat_id, full_name')
        .in('id', userIds);
      const profileById = new Map(
        ((profileRows ?? []) as Profile[]).map((p) => [p.id, p]),
      );

      const newLogs: { notification_id: string; channel: string }[] = [];
      for (const notif of mentions as MentionNotification[]) {
        if (sentSet.has(notif.id)) continue;

        const recipient = profileById.get(notif.user_id);
        if (!recipient?.telegram_chat_id) continue;

        const { data: enabled } = await sb.rpc('notif_pref_enabled', {
          p_user: notif.user_id,
          p_channel: 'telegram',
          p_event: 'mention',
        });
        if (enabled === false) continue;

        const senderName = notif.payload.by
          ? (profileById.get(notif.payload.by)?.full_name ?? 'Biri')
          : 'Biri';
        const preview = notif.payload.preview ?? '';
        const text =
          `💬 ${senderName} sizi qeyd etdi:` +
          (preview ? `\n"${preview.slice(0, 160)}${preview.length > 160 ? '…' : ''}"` : '');

        const out = await sendTelegramMessage(recipient.telegram_chat_id, text);
        if (out.ok) {
          newLogs.push({ notification_id: notif.id, channel: 'telegram' });
          mentionSent += 1;
        }
      }

      if (newLogs.length > 0) {
        await sb.from('notification_log').insert(newLogs);
      }
    }

    return jsonResponse({
      ok: true,
      finance_drained: financeDrained,
      mention_sent: mentionSent,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('az-Latn-AZ', { maximumFractionDigits: 2 }).format(n);
}
