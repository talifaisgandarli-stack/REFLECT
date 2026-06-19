/**
 * Admin-only invite. Issues a 48h token; returns a shareable magic-link
 * URL straight to the admin (no email send). Email/Resend wiring was
 * removed because it added five failure modes (RESEND_API_KEY missing,
 * domain unverified, PUBLIC_APP_URL pointing at a stale preview deploy,
 * etc.) and the admin was always going to paste the link into
 * WhatsApp/Telegram anyway. PRD §256 / REQ-AUTH-02 still satisfied: row
 * is created, token issued, 48h expiry, listed under "Gözləyən dəvətlər",
 * revoke flow unchanged. Audited per PRD §9.4 (invitation.created →
 * audit_log).
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
    const { data: role, error: roleErr } = await sb
      .from('roles')
      .select('id, key, name')
      .eq('key', role_key)
      .maybeSingle();
    if (roleErr) {
      throw new HttpError(500, `Rol axtarışı uğursuz: ${roleErr.message}`);
    }
    if (!role) {
      throw new HttpError(400, `Bu key DB-də yoxdur: "${role_key}". Seed migrasiyası işləyibmi?`);
    }

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 48 * 3600_000).toISOString();

    // SELECT-then-INSERT/UPDATE instead of upsert(onConflict). The upsert
    // path depended on a UNIQUE constraint on `invitations.email` which
    // the original schema (0001) never created, and PostgreSQL's
    // ON CONFLICT (col) inference doesn't pick up partial unique indexes
    // either. Splitting the two cases removes the entire schema-coupling
    // class of failures — works regardless of which migrations have run.
    // PRD §270 ("Re-invite same email (existing pending) → reuse and
    // bump expiry") is satisfied by the UPDATE branch.
    const { data: existing, error: lookupErr } = await sb
      .from('invitations')
      .select('id')
      .eq('email', email)
      .is('accepted_at', null)
      .maybeSingle();
    if (lookupErr) {
      throw new HttpError(500, `Dəvət axtarışı uğursuz: ${lookupErr.message}`);
    }

    if (existing) {
      const { error: updateErr } = await sb
        .from('invitations')
        .update({ role_id: role.id, invited_by: user.id, token, expires_at: expires })
        .eq('id', existing.id);
      if (updateErr) {
        throw new HttpError(500, `Dəvət yenilənmədi: ${updateErr.message}`);
      }
    } else {
      const { error: insertErr } = await sb
        .from('invitations')
        .insert({ email, role_id: role.id, invited_by: user.id, token, expires_at: expires, accepted_at: null });
      if (insertErr) {
        throw new HttpError(500, `Dəvət yaradılmadı: ${insertErr.message}`);
      }
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    await logAudit(sb, {
      actorId: user.id,
      action: 'invitation.created',
      resource: `invitations:${email}`,
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
      meta: { role_key, email },
    });

    // Build the magic-link host with this precedence:
    //   1. PUBLIC_APP_URL — explicit operator override (e.g. custom domain).
    //   2. VERCEL_PROJECT_PRODUCTION_URL — auto-set on every Vercel deploy
    //      (preview AND prod) and ALWAYS points at the production URL.
    //      This is what saves us when the admin is browsing a preview
    //      deploy: their Origin header is the preview host, but preview
    //      hosts are gated by Vercel Deployment Protection. Inheriting
    //      that into the invite link means the invitee hits the auth
    //      wall and can never reach the app. Prefer the prod URL instead.
    //   3. Origin header — last-resort fallback for local dev or non-Vercel
    //      hosting where neither env var is set.
    const prodUrlBare = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const prodUrl = prodUrlBare
      ? prodUrlBare.startsWith('http') ? prodUrlBare : `https://${prodUrlBare}`
      : '';
    const origin = req.headers.get('origin') || '';
    const appUrl = process.env.PUBLIC_APP_URL || prodUrl || origin;
    const inviteUrl = appUrl ? `${appUrl}/login?invite=${token}` : `/login?invite=${token}`;

    return jsonResponse({ ok: true, token, invite_url: inviteUrl });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'invitations/create');
