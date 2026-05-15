/**
 * Notification fan-out consumer — PRD §6.4 + §8.1.
 *
 * Drains the notifications table (rows where dispatched_channels = '{}') and
 * sends each through Resend (email) and the Telegram bot per the user's
 * notification_preferences. Idempotent: every successful channel stamps
 * dispatched_channels.<channel> = timestamp so a re-run never duplicates.
 *
 * Hard rule (PRD §8.1): finance_alert events route to Telegram ONLY for
 * admin chat IDs. For non-admin recipients we skip Telegram outright even
 * if their pref toggle is enabled.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

const BATCH = 100;
const FROM_EMAIL = process.env.RESEND_FROM ?? 'Reflect <noreply@reflect.studio>';

type NotifRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  dispatched_channels: Record<string, string>;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  telegram_chat_id: string | null;
  is_creator: boolean;
  role_id: string | null;
};

type RoleRow = { id: string; is_admin: boolean };

const KIND_TITLE: Record<string, string> = {
  mention: 'Sənə müraciət',
  task_assigned: 'Yeni tapşırıq təyin edildi',
  task_status_changed: 'Tapşırıq statusu dəyişdi',
  task_done: 'Tapşırıq tamamlandı',
  task_cancelled: 'Tapşırıq ləğv edildi',
  deadline_reminder: 'Deadline yaxınlaşır',
  finance_alert: 'Maliyyə xəbərdarlığı',
  performance_review: 'Performans qiymətləndirməsi',
  leave_request: 'Yeni məzuniyyət sorğusu',
  leave_approved: 'Məzuniyyət təsdiqləndi',
  leave_denied: 'Məzuniyyət rədd edildi',
  okr_nudge: 'Həftəlik OKR yenilənməsi',
  content_due_soon: 'Məzmun planı yaxınlaşır',
  announcement: 'Yeni elan',
  salary_changed: 'Maaş cədvəliniz yeniləndi',
  // PRD §7.8 + §10.4 — MIRAI CMO feed posts awaiting admin moderation
  mirai_feed: 'MIRAI yeni məzmun əlavə etdi',
};

function bodyFor(n: NotifRow): string {
  const p = n.payload ?? {};
  const lines: string[] = [];
  if (typeof p.title === 'string') lines.push(p.title);
  if (typeof p.from === 'string' && typeof p.to === 'string') {
    lines.push(`Status: ${p.from} → ${p.to}`);
  }
  if (typeof p.deadline === 'string') lines.push(`Deadline: ${p.deadline}`);
  if (typeof p.scheduled_at === 'string') lines.push(`Tarix: ${p.scheduled_at}`);
  if (typeof p.reason === 'string') lines.push(p.reason);
  if (typeof p.amount === 'number' && typeof p.currency === 'string') {
    lines.push(`Məbləğ: ${p.amount.toLocaleString('az-AZ')} ${p.currency}`);
  }
  return lines.join('\n');
}

function titleFor(kind: string): string {
  return KIND_TITLE[kind] ?? 'Bildiriş';
}

async function prefMap(
  sb: ReturnType<typeof admin>,
  userIds: string[],
): Promise<Map<string, Map<string, boolean>>> {
  // Returns map<userId, map<"channel:event", enabled>>. Defaults assumed true.
  const out = new Map<string, Map<string, boolean>>();
  if (userIds.length === 0) return out;
  const { data } = await sb
    .from('notification_preferences')
    .select('user_id, channel, event_kind, enabled')
    .in('user_id', userIds);
  for (const r of data ?? []) {
    const inner = out.get(r.user_id) ?? new Map();
    inner.set(`${r.channel}:${r.event_kind}`, !!r.enabled);
    out.set(r.user_id, inner);
  }
  return out;
}

function isEnabled(
  prefs: Map<string, Map<string, boolean>>,
  userId: string,
  channel: 'email' | 'telegram' | 'inapp',
  event: string,
): boolean {
  // Opt-out model: missing row = enabled.
  return prefs.get(userId)?.get(`${channel}:${event}`) ?? true;
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, text }),
  });
  return res.ok;
}

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
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();

    // 1. Pull a batch of un-dispatched rows
    const { data: rows, error } = await sb
      .from('notifications')
      .select('id, user_id, kind, payload, created_at, dispatched_channels')
      .eq('dispatched_channels', '{}')
      .order('created_at', { ascending: true })
      .limit(BATCH);
    if (error) throw new HttpError(500, error.message);
    const notifs = (rows ?? []) as NotifRow[];
    if (notifs.length === 0) {
      return jsonResponse({ ok: true, processed: 0 });
    }

    // 2. Resolve profiles + admin status for everyone in this batch
    const userIds = Array.from(new Set(notifs.map((n) => n.user_id)));
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, email, full_name, telegram_chat_id, is_creator, role_id')
      .in('id', userIds);
    const profMap = new Map<string, ProfileRow>();
    for (const p of (profiles ?? []) as ProfileRow[]) profMap.set(p.id, p);

    const roleIds = Array.from(
      new Set((profiles ?? []).map((p) => p.role_id).filter(Boolean) as string[]),
    );
    const adminRoles = new Set<string>();
    if (roleIds.length > 0) {
      const { data: roles } = await sb.from('roles').select('id, is_admin').in('id', roleIds);
      for (const r of (roles ?? []) as RoleRow[]) {
        if (r.is_admin) adminRoles.add(r.id);
      }
    }

    const prefs = await prefMap(sb, userIds);

    // 3. Dispatch loop
    let dispatched = 0;
    let failed = 0;
    for (const n of notifs) {
      const profile = profMap.get(n.user_id);
      if (!profile) continue;
      const isAdmin = profile.is_creator || (profile.role_id ? adminRoles.has(profile.role_id) : false);
      const updates: Record<string, string> = {};
      const subject = titleFor(n.kind);
      const body = `${subject}\n\n${bodyFor(n)}`.trim();

      // Email channel
      if (
        profile.email &&
        isEnabled(prefs, n.user_id, 'email', n.kind) &&
        !n.dispatched_channels.email
      ) {
        const ok = await sendEmail(profile.email, subject, body);
        if (ok) updates.email = new Date().toISOString();
        else failed++;
      }

      // Telegram channel — finance routes admin-only per §8.1
      const telegramAllowed = n.kind !== 'finance_alert' || isAdmin;
      if (
        telegramAllowed &&
        profile.telegram_chat_id &&
        isEnabled(prefs, n.user_id, 'telegram', n.kind) &&
        !n.dispatched_channels.telegram
      ) {
        const ok = await sendTelegram(profile.telegram_chat_id, body);
        if (ok) updates.telegram = new Date().toISOString();
        else failed++;
      }

      if (Object.keys(updates).length > 0) {
        // Merge with existing dispatched_channels (no clobber on retry)
        const merged = { ...n.dispatched_channels, ...updates };
        await sb.from('notifications').update({ dispatched_channels: merged }).eq('id', n.id);
        dispatched++;
      }
    }

    return jsonResponse({ ok: true, processed: notifs.length, dispatched, failed });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'cron/notify-fanout');
