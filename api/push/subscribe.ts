/**
 * POST /api/push/subscribe   — store a Web Push subscription for the user.
 * DELETE /api/push/subscribe  — remove one (body: { endpoint }).
 *
 * Auth: Bearer JWT (requireUser). Rows are keyed by unique endpoint and upserted
 * so re-subscribing on the same device refreshes ownership / last_seen.
 * Edge runtime — only touches Postgres via supabase-js, no Node crypto here.
 */
import { admin, requireUser, errorResponse, jsonResponse, HttpError } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

type SubBody = {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  endpoint?: string;
};

async function handler(req: Request): Promise<Response> {
  try {
    const user = await requireUser(req);
    const db = admin();

    if (req.method === 'DELETE') {
      const { endpoint } = (await req.json().catch(() => ({}))) as SubBody;
      if (!endpoint) throw new HttpError(400, 'endpoint required');
      await db.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id);
      return jsonResponse({ ok: true });
    }

    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const body = (await req.json().catch(() => ({}))) as SubBody;
    const sub = body.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) throw new HttpError(400, 'Invalid subscription');

    const { error } = await db.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('user-agent') ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new HttpError(500, error.message);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'push/subscribe');
