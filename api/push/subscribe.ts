/**
 * POST /api/push/subscribe   — store a Web Push subscription for the user.
 * DELETE /api/push/subscribe  — remove one (body: { endpoint }).
 *
 * Auth: Bearer JWT. Writes run with the caller's OWN token (userClient), NOT the
 * service role — RLS policy `push_self` (user_id = auth.uid()) already permits a
 * user to manage their own subscriptions. This mirrors presence/heartbeat and
 * keeps device registration working on deployments where only the anon key is
 * configured. (SUPABASE_SERVICE_ROLE_KEY is only needed by /api/push/notify,
 * which must read *other* users' subscriptions to deliver their pushes.)
 * Edge runtime — only touches Postgres via supabase-js, no Node crypto here.
 */
import { errorResponse, HttpError, jsonResponse, userClient } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

type SubBody = {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  endpoint?: string;
};

async function handler(req: Request): Promise<Response> {
  try {
    const authz = req.headers.get('authorization') ?? '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) throw new HttpError(401, 'Missing bearer token');

    // Caller's own JWT — RLS scopes every write to their own rows (push_self).
    const db = userClient(token);
    const { data: ures, error: uerr } = await db.auth.getUser(token);
    if (uerr || !ures?.user) throw new HttpError(401, 'Invalid token');
    const uid = ures.user.id;

    if (req.method === 'DELETE') {
      const { endpoint } = (await req.json().catch(() => ({}))) as SubBody;
      if (!endpoint) throw new HttpError(400, 'endpoint required');
      const { error } = await db
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .eq('user_id', uid);
      if (error) throw new HttpError(500, `push delete failed: ${error.message}`);
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
        user_id: uid,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('user-agent') ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new HttpError(500, `push upsert failed: ${error.message}`);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'push/subscribe');
