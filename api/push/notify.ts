/**
 * POST /api/push/notify — deliver a Web Push for one notification row.
 *
 * Called by a Supabase Database Webhook on INSERT into `notifications` (so push
 * is instant, not batched). Auth is a shared secret in the `x-push-secret`
 * header, matched against env PUSH_HOOK_SECRET. Node runtime (NOT edge): the
 * `web-push` library needs Node crypto for VAPID signing + payload encryption.
 *
 * Expired endpoints (404/410) are pruned so dead devices don't accumulate.
 */
import type webpushType from 'web-push';
import { admin } from '../_lib/auth';

// No `export const config` → defaults to the Node.js runtime, where web-push works.
// web-push is imported *dynamically* inside the handler (not top-level) so that a
// module-load failure (e.g. if this ever runs on a runtime without Node crypto)
// surfaces as a readable 500 instead of an uncatchable FUNCTION_INVOCATION_FAILED.

const KIND_LABEL: Record<string, string> = {
  mention: 'Sənə müraciət',
  task_assigned: 'Yeni tapşırıq təyin edildi',
  task_status_changed: 'Tapşırıq statusu dəyişdi',
  task_done: 'Tapşırıq tamamlandı',
  task_cancelled: 'Tapşırıq ləğv edildi',
  deadline_reminder: 'Deadline yaxınlaşır',
  finance_alert: 'Maliyyə xəbərdarlığı',
  announcement: 'Yeni elan',
  mirai_feed: 'MIRAI tövsiyəsi',
  salary_changed: 'Əmək haqqı yeniləndi',
  leave_requested: 'Məzuniyyət sorğusu',
  leave_approved: 'Məzuniyyət təsdiqləndi',
  leave_denied: 'Məzuniyyət rədd edildi',
  okr_nudge: 'OKR xatırlatması',
  content_due_soon: 'Kontent müddəti yaxınlaşır',
  meeting_reminder: 'Görüş xatırlatması',
  performance_review: 'Performans qiymətləndirməsi',
};

// A best-effort deep link per kind so tapping the notification lands somewhere useful.
function urlFor(kind: string): string {
  if (kind.startsWith('task') || kind === 'mention' || kind === 'deadline_reminder') return '/tapşırıqlar';
  if (kind === 'finance_alert' || kind === 'salary_changed') return '/maliyyə';
  if (kind.startsWith('leave')) return '/məzuniyyət';
  if (kind === 'announcement') return '/elanlar';
  if (kind === 'okr_nudge') return '/okr';
  return '/';
}

function messageFor(record: { kind?: string; payload?: Record<string, unknown> }) {
  const kind = record.kind ?? '';
  const title = KIND_LABEL[kind] ?? 'REFLECT';
  const p = record.payload ?? {};
  const detail =
    (typeof p.title === 'string' && p.title) ||
    (typeof p.task_title === 'string' && p.task_title) ||
    (typeof p.message === 'string' && p.message) ||
    '';
  return {
    title,
    body: detail || 'Yeni bildiriş',
    url: urlFor(kind),
    tag: kind || undefined,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function run(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = process.env.PUSH_HOOK_SECRET;
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@reflectmirai.online';
  if (!pub || !priv) return json({ error: 'VAPID keys not configured' }, 500);

  // Load web-push lazily so a bundling/runtime incompatibility is catchable.
  let webpush: typeof webpushType;
  try {
    webpush = ((await import('web-push')) as unknown as { default: typeof webpushType }).default;
  } catch (e) {
    return json({ error: `web-push load failed: ${(e as Error)?.message ?? String(e)}` }, 500);
  }

  // setVapidDetails validates key/subject format and THROWS on malformed input
  // (a common copy-paste footgun). Catch it so we return a readable 500 instead
  // of an opaque FUNCTION_INVOCATION_FAILED crash.
  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (e) {
    return json({ error: `VAPID setup failed: ${(e as Error)?.message ?? String(e)}` }, 500);
  }

  let body: { record?: { user_id?: string; kind?: string; payload?: Record<string, unknown> } };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const record = body.record;
  if (!record?.user_id) return new Response(JSON.stringify({ ok: true, skipped: 'no record' }), { status: 200 });

  const db = admin();
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', record.user_id);
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });
  }

  const msg = JSON.stringify(messageFor(record));
  let sent = 0;
  const dead: string[] = [];
  const errors: string[] = [];
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          msg,
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          dead.push(s.id); // expired endpoint — prune it
        } else {
          // 401/403 (bad VAPID), 413 (payload too large), etc. Surface so the
          // caller/log shows why delivery failed instead of a silent sent:0.
          errors.push(`${status ?? 'ERR'}: ${(e as Error)?.message ?? String(e)}`);
        }
      }
    }),
  );
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);

  return json({ ok: true, sent, pruned: dead.length, errors: errors.length ? errors : undefined });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await run(req);
  } catch (e) {
    // Last line of defence: any uncaught throw (admin() env missing, unexpected
    // runtime error) becomes a readable 500 instead of FUNCTION_INVOCATION_FAILED.
    console.error('[push/notify]', e);
    return json({ error: `notify failed: ${(e as Error)?.message ?? String(e)}` }, 500);
  }
}
