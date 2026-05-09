/**
 * Admin-only invite. Issues a 48h token, sends magic-link email via Resend.
 * REQ-AUTH-02.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { inviteEmail, sendEmail } from '../_lib/email';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const { email, role_key, locale } = (await req.json()) as {
      email?: string;
      role_key?: string;
      locale?: 'az' | 'en' | 'ru';
    };
    if (!email || !role_key) throw new HttpError(400, 'email + role_key required');

    const sb = admin();
    const { data: role } = await sb
      .from('roles')
      .select('id, name')
      .eq('key', role_key)
      .maybeSingle();
    if (!role) throw new HttpError(400, 'Unknown role');

    const { data: inviter } = await sb
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 48 * 3600_000).toISOString();

    await sb
      .from('invitations')
      .upsert(
        { email, role_id: role.id, invited_by: user.id, token, expires_at: expires, accepted_at: null },
        { onConflict: 'email' },
      );

    await sendEmail(
      inviteEmail({
        to: email,
        inviteToken: token,
        inviterName: inviter?.full_name ?? null,
        roleName: role.name,
        locale,
      }),
    );

    return jsonResponse({ ok: true, token });
  } catch (e) {
    return errorResponse(e);
  }
}
