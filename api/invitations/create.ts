/**
 * Admin-only invite. Issues a 48h token, sends magic-link email via Resend.
 * REQ-AUTH-02. Audited per PRD §9.4 (invitation.created → audit_log).
 */
import { z } from 'zod';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';
import { checkRateLimit } from '../_lib/rate-limit';
import { logAudit } from '../_lib/audit';

export const config = { runtime: 'edge' };

const Body = z.object({
  email: z.string().email(),
  role_key: z.string().min(1),
});

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const rateLimitErr = await checkRateLimit(req, user);
    if (rateLimitErr) return rateLimitErr;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
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

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    await logAudit(sb, {
      actorId: user.id,
      action: 'invitation.created',
      resource: `invitations:${email}`,
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
      meta: { role_key, email },
    });

    const resendKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.PUBLIC_APP_URL;

    // Track email send status so the UI can show admin exactly why the
    // recipient didn't get an email (and surface the token + manual share
    // path). Previously the email step was either skipped silently or its
    // error swallowed via .catch(() => null), so a misconfigured deployment
    // returned ok:true while no email ever went out.
    let emailSent = false;
    let emailError: string | null = null;

    if (!resendKey) {
      emailError = 'RESEND_API_KEY təyin edilməyib';
    } else if (!appUrl) {
      emailError = 'PUBLIC_APP_URL təyin edilməyib';
    } else {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${resendKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Reflect <noreply@reflect.az>',
            to: email,
            subject: 'Reflect-ə dəvətnamə',
            html: `<p>Salam,</p><p>Reflect-ə qoşulmaq üçün <a href="${appUrl}/login?invite=${token}">linki aç</a>. Müddət: 48 saat.</p>`,
          }),
        });
        if (emailRes.ok) {
          emailSent = true;
        } else {
          const body = await emailRes.text().catch(() => '');
          emailError = `Resend ${emailRes.status}: ${body.slice(0, 200) || 'naməlum xəta'}`;
        }
      } catch (e) {
        emailError = (e as Error).message;
      }
    }

    return jsonResponse({ ok: true, token, email_sent: emailSent, email_error: emailError });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'invitations/create');
