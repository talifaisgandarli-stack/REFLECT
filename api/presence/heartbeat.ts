/**
 * Presence heartbeat — REQ-PRESENCE-02 / REQ-PRESENCE-05.
 * Frontend pings every 30s with a per-tab session_id. Each session writes its
 * own presence_sessions row; a DB trigger collapses a user's live sessions into
 * the canonical user_presence row (highest priority wins). On 'offline' the
 * session row is removed so the trigger can re-derive the user's state.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const { current_page, status, session_type, session_id } = (await req.json()) as {
      current_page?: string;
      status?: 'online' | 'away' | 'offline';
      session_type?: 'desktop' | 'mobile';
      session_id?: string;
    };
    // Fallback keeps older clients (no session_id) working as a single session.
    const sid = session_id && session_id.length > 0 ? session_id : 'legacy';
    const sb = admin();

    if ((status ?? 'online') === 'offline') {
      // Drop this session; the trigger recomputes user_presence (offline iff no
      // other live session remains).
      await sb.from('presence_sessions').delete().eq('user_id', user.id).eq('session_id', sid);
    } else {
      await sb.from('presence_sessions').upsert(
        {
          user_id: user.id,
          session_id: sid,
          status: status ?? 'online',
          last_heartbeat_at: new Date().toISOString(),
          current_page: current_page ?? null,
          session_type: session_type ?? 'desktop',
        },
        { onConflict: 'user_id,session_id' },
      );
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'presence/heartbeat');
