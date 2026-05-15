/**
 * Presence heartbeat — REQ-PRESENCE-02.
 * Frontend pings every 30s; this updates user_presence row + computes derived status.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const { current_page, status, session_type } = (await req.json()) as {
      current_page?: string;
      status?: 'online' | 'away' | 'offline';
      session_type?: 'desktop' | 'mobile';
    };
    const sb = admin();
    await sb.from('user_presence').upsert(
      {
        user_id: user.id,
        status: status ?? 'online',
        last_heartbeat_at: new Date().toISOString(),
        current_page: current_page ?? null,
        session_type: session_type ?? 'desktop',
      },
      { onConflict: 'user_id' },
    );
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'presence/heartbeat');
