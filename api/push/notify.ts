/**
 * POST /api/push/notify — deliver a Web Push for one notification row.
 *
 * Called by a pg_net trigger on INSERT into `notifications` (so push is instant,
 * not batched). Auth is a shared secret in the `x-push-secret` header, matched
 * against env PUSH_HOOK_SECRET.
 *
 * Edge runtime: the `web-push` npm library needs the Node.js runtime, which does
 * NOT work in this Vercel project (Node functions crash at bootstrap with
 * FUNCTION_INVOCATION_FAILED — every deployed function here is Edge). So push
 * signing + encryption is done with the Web Crypto API via ../_lib/webpush.
 *
 * Expired endpoints (404/410) are pruned so dead devices don't accumulate.
 */
import { admin } from '../_lib/auth';
import { sendWebPush } from '../_lib/webpush';

export const config = { runtime: 'edge' };

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
  const vapid = { subject, publicKey: pub, privateKey: priv };

  let body: { record?: { user_id?: string; kind?: string; payload?: Record<string, unknown> } };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const record = body.record;
  if (!record?.user_id) return json({ ok: true, skipped: 'no record' });

  const db = admin();
  const { data: subs, error: dbErr } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', record.user_id);
  if (dbErr) return json({ error: `subscriptions read failed: ${dbErr.message}` }, 500);
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0 });

  const msg = JSON.stringify(messageFor(record));
  let sent = 0;
  const dead: string[] = [];
  const errors: string[] = [];
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        const r = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg, vapid);
        if (r.ok) {
          sent += 1;
        } else if (r.statusCode === 404 || r.statusCode === 410) {
          dead.push(s.id); // expired endpoint — prune it
        } else {
          // 401/403 (bad VAPID), 413 (payload too large), etc. Surface so the
          // response/log shows why delivery failed instead of a silent sent:0.
          errors.push(`${r.statusCode}: ${r.body.slice(0, 200)}`);
        }
      } catch (e) {
        // Encryption/signing error for this one subscription — record and move on.
        errors.push(`send threw: ${(e as Error)?.message ?? String(e)}`);
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
