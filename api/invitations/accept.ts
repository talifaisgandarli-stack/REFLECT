/**
 * Public invitation acceptance — REQ-AUTH-02.
 *
 * Inputs (POST JSON): { token, password, full_name? }
 * Verifies the invitation: not expired, not already accepted. Creates the
 * auth user via the admin API (email pre-confirmed, since the invite link
 * is the verification), inserts a profiles row with role_id and is_active=true,
 * and stamps invitations.accepted_at.
 *
 * No bearer auth — the token IS the auth.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const { token, password, full_name } = (await req.json()) as {
      token?: string;
      password?: string;
      full_name?: string;
    };
    if (!token) throw new HttpError(400, 'token required');
    if (!password || password.length < 8) {
      throw new HttpError(400, 'Şifrə ən azı 8 simvol olmalıdır.');
    }

    const sb = admin();

    const { data: inv, error: invErr } = await sb
      .from('invitations')
      .select('id, email, role_id, expires_at, accepted_at')
      .eq('token', token)
      .maybeSingle();
    if (invErr || !inv) throw new HttpError(404, 'Dəvətnamə tapılmadı');
    if (inv.accepted_at) throw new HttpError(409, 'Bu dəvətnamə artıq qəbul edilib');
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      throw new HttpError(410, 'Dəvətnamənin müddəti bitib');
    }

    // Edge case (PRD §10 Module 1): if a profile already exists for this email
    // (re-invite of an active user), bind the existing profile rather than
    // creating a duplicate auth user.
    const { data: existing } = await sb
      .from('profiles')
      .select('id')
      .eq('email', inv.email)
      .maybeSingle();
    if (existing) {
      throw new HttpError(409, 'Bu email artıq qeydiyyatdadır. Daxil ol.');
    }

    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? null },
    });
    if (createErr || !created?.user) {
      throw new HttpError(500, createErr?.message ?? 'Hesab yaradıla bilmədi');
    }

    const { error: profErr } = await sb.from('profiles').insert({
      id: created.user.id,
      email: inv.email,
      full_name: full_name ?? null,
      role_id: inv.role_id,
      is_active: true,
    });
    if (profErr) {
      // Rollback the auth user so the invite stays valid for retry.
      await sb.auth.admin.deleteUser(created.user.id).catch(() => null);
      throw new HttpError(500, profErr.message);
    }

    await sb
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inv.id);

    return jsonResponse({ ok: true, email: inv.email });
  } catch (e) {
    return errorResponse(e);
  }
}
