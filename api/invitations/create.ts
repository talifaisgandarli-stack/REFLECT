/**
 * Admin-only invite. Issues a 48h token, sends magic-link email via Resend.
 * REQ-AUTH-02.
 */
import { z } from 'zod';
import { admin, errorResponse, HttpError, jsonResponse, requireUser, writeAuditLog } from '../_lib/auth';

const InviteSchema = z.object({
  email: z.string().email('Düzgün email daxil edin'),
  role_key: z.string().min(1, 'role_key tələb olunur'),
});

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const raw = await req.json().catch(() => null);
    const parsed = InviteSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((e) => e.message).join('; '));
    const { email, role_key } = parsed.data;

    const sb = admin();
    const { data: role } = await sb.from('roles').select('id').eq('key', role_key).maybeSingle();
    if (!role) throw new HttpError(400, 'Unknown role');

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 48 * 3600_000).toISOString();

    await sb
      .from('invitations')
      .upsert(
        { email, role_id: role.id, invited_by: user.id, token, expires_at: expires, accepted_at: null },
        { onConflict: 'email' },
      );

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Reflect <noreply@reflect.az>',
          to: email,
          subject: 'Reflect-ə dəvətnamə',
          html: `<p>Salam,</p><p>Reflect-ə qoşulmaq üçün <a href="${process.env.PUBLIC_APP_URL ?? ''}/login?invite=${token}">linki aç</a>. Müddət: 48 saat.</p>`,
        }),
      }).catch(() => null);
    }

    await writeAuditLog(user.id, 'invite_created', `email:${email} role:${role_key}`, req);

    return jsonResponse({ ok: true, token });
  } catch (e) {
    return errorResponse(e);
  }
}
