/**
 * US-TG-03 — drain telegram_alert_queue.
 *
 * DB triggers on incomes/expenses (migration 0010) push rows into
 * telegram_alert_queue when amount >= the configured threshold. This cron
 * fans them out to every admin whose Telegram is linked and whose
 * notification_preferences allow channel='telegram', event='finance_alert'.
 *
 * "All financial Telegram messages route ONLY to admin chat IDs." — §8.1.
 * We enforce that by filtering profiles via roles.is_admin = true.
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

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();

    const { data: queue, error } = await sb
      .from('telegram_alert_queue')
      .select('id, kind, payload')
      .is('sent_at', null)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new HttpError(500, error.message);
    if (!queue || queue.length === 0) {
      return jsonResponse({ ok: true, drained: 0 });
    }

    // Resolve admin recipients with linked Telegram. We join profiles → roles
    // via two queries because PostgREST embedding here would be awkward and
    // roles is small.
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

    // Project labels (best-effort)
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

    return jsonResponse({ ok: true, drained: sentIds.length, queued: queue.length });
  } catch (e) {
    return errorResponse(e);
  }
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('az-Latn-AZ', { maximumFractionDigits: 2 }).format(n);
}
