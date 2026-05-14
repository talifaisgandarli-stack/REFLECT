/**
 * REQ-AUTH-03 — Admin-only user management endpoint.
 * PRD §5 Module 1 line 257: "Email/role: admin only"
 *
 * Accepts: { user_id, role_id?, email?, is_active? }
 * - role_id  → updates profiles.role_id
 * - is_active → updates profiles.is_active (cannot deactivate self)
 * - email    → updates auth.users via service-role admin API + syncs profiles.email
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin required');

    const body = (await req.json()) as {
      user_id?: string;
      role_id?: string | null;
      email?: string;
      is_active?: boolean;
    };

    const { user_id, role_id, email, is_active } = body;
    if (!user_id) throw new HttpError(400, 'user_id required');
    if (user_id === user.id && is_active === false) {
      throw new HttpError(400, 'Öz hesabınızı deaktiv edə bilməzsiniz');
    }

    const sb = admin();

    // profile fields
    const profilePatch: Record<string, unknown> = {};
    if (role_id !== undefined) profilePatch.role_id = role_id;
    if (is_active !== undefined) profilePatch.is_active = is_active;
    if (Object.keys(profilePatch).length > 0) {
      const { error } = await sb.from('profiles').update(profilePatch).eq('id', user_id);
      if (error) throw new HttpError(500, error.message);
    }

    // email update (auth.users + profiles sync)
    if (email !== undefined) {
      const trimmed = email.trim().toLowerCase();
      if (!EMAIL_RE.test(trimmed)) throw new HttpError(400, 'Etibarsız email formatı');
      const { error: authErr } = await sb.auth.admin.updateUserById(user_id, { email: trimmed });
      if (authErr) throw new HttpError(500, authErr.message);
      const { error: profErr } = await sb.from('profiles').update({ email: trimmed }).eq('id', user_id);
      if (profErr) throw new HttpError(500, profErr.message);
    }

    await sb.from('audit_log').insert({
      action: 'admin_update_user',
      resource: `profile:${user_id}`,
    }).then(null, () => null);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
