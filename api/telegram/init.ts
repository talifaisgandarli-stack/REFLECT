/**
 * Generate a one-time linking code; stored in system_settings keyed by user.
 * Bot webhook (telegram/webhook.ts) consumes the code on /start <code>.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const sb = admin();
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await sb.from('system_settings').upsert(
      {
        key: `telegram_link:${code}`,
        value: { user_id: user.id, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() },
        updated_by: user.id,
      },
      { onConflict: 'key' },
    );
    return jsonResponse({ code });
  } catch (e) {
    return errorResponse(e);
  }
}
