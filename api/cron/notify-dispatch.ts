/**
 * Notification dispatcher — PRD §6.4.
 * Scans unsent notifications, reads notification_preferences per user, and
 * fans out to email (Resend) and Telegram. In-app delivery is the row
 * itself — the UI reads notifications directly. Stamps dispatched_at when
 * done so retries are idempotent.
 *
 * Env:
 *   CRON_SECRET            — auth (or x-vercel-cron header)
 *   RESEND_API_KEY         — optional; email skipped if missing
 *   RESEND_FROM            — sender, e.g. "Reflect <noreply@reflect.az>"
 *   TELEGRAM_BOT_TOKEN     — optional; Telegram skipped if missing
 *
 * Auth: x-vercel-cron OR ?key=<CRON_SECRET>.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

// Map notifications.kind → notification_preferences.event_kind.
// Multiple kinds can route to one event_kind (e.g. leave_approved/denied).
const KIND_TO_EVENT: Record<string, string> = {
  performance_review: 'performance_review',
  okr_nudge: 'okr_nudge',
  leave_approved: 'leave_decision',
  leave_denied: 'leave_decision',
  equipment_assigned: 'equipment_assigned',
  mention: 'mention',
  status_change: 'status_change',
  finance_alert: 'finance_alert',
  mirai_feed: 'mirai_feed',
  deadline: 'deadline',
};

const BATCH = 100;
const RESEND_FROM = process.env.RESEND_FROM ?? 'Reflect <notify@reflect.local>';

type NotifRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};
type ProfileRow = { id: string; email: string; full_name: string | null; telegram_chat_id: string | null };
type PrefRow = { user_id: string; channel: 'in_app' | 'email' | 'telegram'; event_kind: string; enabled: boolean };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();

    const { data: notifs, error: nErr } = await sb
      .from('notifications')
      .select('id, user_id, kind, payload, created_at')
      .is('dispatched_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH);
    if (nErr) throw nErr;
    if (!notifs || notifs.length === 0) {
      return jsonResponse({ ok: true, dispatched: 0 });
    }

    const userIds = [...new Set(notifs.map((n) => n.user_id))];

    const { data: profilesData } = await sb
      .from('profiles')
      .select('id, email, full_name, telegram_chat_id')
      .in('id', userIds);
    const profilesById = new Map<string, ProfileRow>();
    for (const p of (profilesData ?? []) as ProfileRow[]) profilesById.set(p.id, p);

    const { data: prefsData } = await sb
      .from('notification_preferences')
      .select('user_id, channel, event_kind, enabled')
      .in('user_id', userIds);
    const prefsByKey = new Map<string, boolean>();
    for (const p of (prefsData ?? []) as PrefRow[]) {
      prefsByKey.set(`${p.user_id}:${p.channel}:${p.event_kind}`, p.enabled);
    }

    const RESEND = process.env.RESEND_API_KEY;
    const TGRAM = process.env.TELEGRAM_BOT_TOKEN;

    let emailSent = 0;
    let telegramSent = 0;
    const dispatchedIds: string[] = [];

    for (const n of notifs as NotifRow[]) {
      const eventKind = KIND_TO_EVENT[n.kind] ?? n.kind;
      const profile = profilesById.get(n.user_id);
      if (!profile) {
        dispatchedIds.push(n.id);
        continue;
      }

      const subject = formatSubject(n);
      const body = formatBody(n);

      // Default per-channel state when no row exists: in_app on, others off.
      const wantEmail = prefsByKey.get(`${n.user_id}:email:${eventKind}`) ?? false;
      const wantTelegram = prefsByKey.get(`${n.user_id}:telegram:${eventKind}`) ?? false;

      if (wantEmail && RESEND && profile.email) {
        const ok = await sendEmail(RESEND, profile.email, subject, body).catch(() => false);
        if (ok) emailSent++;
      }
      if (wantTelegram && TGRAM && profile.telegram_chat_id) {
        const ok = await sendTelegram(
          TGRAM,
          profile.telegram_chat_id,
          `${subject}\n\n${body}`,
        ).catch(() => false);
        if (ok) telegramSent++;
      }

      dispatchedIds.push(n.id);
    }

    if (dispatchedIds.length > 0) {
      const { error } = await sb
        .from('notifications')
        .update({ dispatched_at: new Date().toISOString() })
        .in('id', dispatchedIds);
      if (error) throw error;
    }

    return jsonResponse({
      ok: true,
      processed: notifs.length,
      email_sent: emailSent,
      telegram_sent: telegramSent,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function formatSubject(n: NotifRow): string {
  switch (n.kind) {
    case 'performance_review':
      return `Yeni performans baxışı (${n.payload?.year ?? ''})`;
    case 'okr_nudge':
      return 'OKR yeniləmə xatırlatması';
    case 'leave_approved':
      return 'Məzuniyyət təsdiqləndi';
    case 'leave_denied':
      return 'Məzuniyyət rədd edildi';
    case 'equipment_assigned':
      return `Avadanlıq tapşırıldı: ${n.payload?.equipment_name ?? ''}`;
    case 'mention':
      return 'Kimsə sizi qeyd etdi';
    default:
      return `Bildiriş: ${n.kind}`;
  }
}

function formatBody(n: NotifRow): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(n.payload ?? {})) {
    lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return lines.join('\n');
}

async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      text,
    }),
  });
  return res.ok;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
}
