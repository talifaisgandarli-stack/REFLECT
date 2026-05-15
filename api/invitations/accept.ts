/**
 * Marks an invitation as accepted by the currently-authenticated user.
 * Called by Login.tsx after successful sign-in when ?invite=<token> is present.
 * REQ-AUTH-02 (PRD §5). Audited per PRD §9.4 (role_change → audit_log).
 */
import { z } from 'zod';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';
import { checkRateLimit } from '../_lib/rate-limit';
import { logAudit } from '../_lib/audit';

export const config = { runtime: 'edge' };

const Body = z.object({ token: z.string().uuid() });

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);

    const rateLimitErr = await checkRateLimit(req, user);
    if (rateLimitErr) return rateLimitErr;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, 'Invalid token format');
    const { token } = parsed.data;

    const sb = admin();
    const { data: inv, error: selErr } = await sb
      .from('invitations')
      .select('id, email, role_id, expires_at, accepted_at')
      .eq('token', token)
      .maybeSingle();

    if (selErr) throw new HttpError(500, selErr.message);
    if (!inv) throw new HttpError(404, 'Invitation not found');
    if (inv.accepted_at) return jsonResponse({ ok: true, already: true });
    if (new Date(inv.expires_at) < new Date()) throw new HttpError(410, 'Invitation expired');
    if (inv.email.toLowerCase() !== user.email.toLowerCase())
      throw new HttpError(403, 'Email mismatch');

    const { error: updErr } = await sb
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inv.id);

    if (updErr) throw new HttpError(500, updErr.message);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    await logAudit(sb, {
      actorId: user.id,
      action: 'role_change',
      resource: `profiles:${user.id}`,
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
      meta: { email: user.email, role_id: inv.role_id, via: 'invitation' },
    });

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'invitations/accept');
