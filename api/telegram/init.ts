/**
 * PRD §11 — Generate a one-time linking code (6 digits, 10-minute TTL).
 * Stored in telegram_link_codes (RLS-scoped to owner). The bot webhook
 * (telegram/webhook.ts) consumes it on /start <code>.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

// crypto.getRandomValues is available in edge runtime; avoid Math.random for codes.
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // 6-digit zero-padded, range 000000–999999
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const sb = admin();

    // Invalidate prior pending codes for this user — only one active at a time.
    await sb.from('telegram_link_codes').delete().eq('user_id', user.id);

    // Retry on the (extremely unlikely) collision with another active code.
    let code = generateCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await sb.from('telegram_link_codes').insert({
        code,
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (!error) break;
      // 23505 = unique_violation
      if ((error as { code?: string }).code !== '23505') throw new HttpError(500, error.message);
      code = generateCode();
      if (attempt === 4) throw new HttpError(500, 'Code generation failed');
    }

    return jsonResponse({ code, expires_in_seconds: 600 });
  } catch (e) {
    return errorResponse(e);
  }
}
