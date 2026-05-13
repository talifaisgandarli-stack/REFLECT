/**
 * Marks an invitation as accepted by the currently-authenticated user.
 * Called by Login.tsx after successful sign-in when ?invite=<token> is present.
 * REQ-AUTH-02 (PRD §5).
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);

    const { token } = (await req.json()) as { token?: string };
    if (!token) throw new HttpError(400, 'token required');

    const sb = admin();
    const { data: inv, error: selErr } = await sb
      .from('invitations')
      .select('id, email, expires_at, accepted_at')
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

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
