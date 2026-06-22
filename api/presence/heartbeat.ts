/**
 * Presence heartbeat — REQ-PRESENCE-02 / REQ-PRESENCE-05.
 * Frontend pings every 30s with a per-tab session_id. Each session writes its
 * own presence_sessions row; a DB trigger collapses a user's live sessions into
 * the canonical user_presence row (highest priority wins). On 'offline' the
 * session row is removed so the trigger can re-derive the user's state.
 *
 * Auth: writes run with the caller's own JWT (userClient), not the service
 * role. A user setting their own presence is already permitted by RLS policy
 * `ps_self` (user_id = auth.uid()), and the aggregation trigger is SECURITY
 * DEFINER — so this needs no SUPABASE_SERVICE_ROLE_KEY. That keeps presence
 * working on deployments where only the anon key is configured.
 */
import { errorResponse, HttpError, jsonResponse, userClient } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const authz = req.headers.get('authorization') ?? '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) throw new HttpError(401, 'Missing bearer token');

    const sb = userClient(token);
    const { data: ures, error: uerr } = await sb.auth.getUser(token);
    if (uerr || !ures?.user) throw new HttpError(401, 'Invalid token');
    const uid = ures.user.id;

    const { current_page, status, session_type, session_id } = (await req.json()) as {
      current_page?: string;
      status?: 'online' | 'away' | 'offline';
      session_type?: 'desktop' | 'mobile';
      session_id?: string;
    };
    // Fallback keeps older clients (no session_id) working as a single session.
    const sid = session_id && session_id.length > 0 ? session_id : 'legacy';

    if ((status ?? 'online') === 'offline') {
      // Drop this session; the trigger recomputes user_presence (offline iff no
      // other live session remains).
      const { error } = await sb
        .from('presence_sessions')
        .delete()
        .eq('user_id', uid)
        .eq('session_id', sid);
      if (error) throw new HttpError(500, `presence delete failed: ${error.message}`);
    } else {
      const { error } = await sb.from('presence_sessions').upsert(
        {
          user_id: uid,
          session_id: sid,
          status: status ?? 'online',
          last_heartbeat_at: new Date().toISOString(),
          current_page: current_page ?? null,
          session_type: session_type ?? 'desktop',
        },
        { onConflict: 'user_id,session_id' },
      );
      // Surface write failures (missing migration, RLS, etc.) instead of
      // silently returning ok — otherwise presence just stays stale.
      if (error) throw new HttpError(500, `presence upsert failed: ${error.message}`);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'presence/heartbeat');
