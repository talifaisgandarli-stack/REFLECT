/**
 * Sign-up via invitation: creates a Supabase Auth user with the chosen
 * password, attaches the role_id from the invitation to the freshly-
 * created profiles row, and marks the invitation accepted. Public (no
 * Authorization header) because the invitee doesn't have a session yet
 * — possession of the unguessable UUID token is the grant. The frontend
 * then signs in with the same email + password to get a real session.
 *
 * Audited per PRD §9.4 (invitation.accepted → audit_log).
 */
import { z } from 'zod';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';
import { logAudit } from '../_lib/audit';

export const config = { runtime: 'edge' };

const Body = z.object({
  token: z.string().uuid(),
  // Eight chars is the floor below which most leaked-password lists
  // become a real worry; we don't impose composition rules (no forced
  // symbols / digits) because per NIST 800-63B those hurt usability
  // without measurably improving security.
  password: z.string().min(8, 'Şifrə ən az 8 simvol olmalıdır'),
});

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const { token, password } = parsed.data;

    const sb = admin();

    // 1. Validate the invitation. Same checks as accept.ts, plus we read
    //    role_id so the new profile lands in the right role.
    const { data: inv, error: selErr } = await sb
      .from('invitations')
      .select('id, email, role_id, expires_at, accepted_at')
      .eq('token', token)
      .maybeSingle();
    if (selErr) throw new HttpError(500, `Dəvət axtarışı uğursuz: ${selErr.message}`);
    if (!inv) throw new HttpError(404, 'Dəvət tapılmadı');
    if (inv.accepted_at) throw new HttpError(410, 'Dəvət artıq qəbul edilib');
    if (new Date(inv.expires_at) < new Date()) throw new HttpError(410, 'Dəvətin müddəti bitib');

    // 2. Create the auth user. email_confirm=true so Supabase doesn't fire
    //    its own confirmation email (we already "confirmed" via the
    //    invitation token). Recovery branch for "user already exists":
    //    a previous signup attempt may have crashed mid-way (auth.users
    //    created + trigger-created profile with role_id=NULL, but the
    //    role-update + invitation-accept steps never ran). In that case
    //    the email is registered but the profile is half-baked. If
    //    profile.role_id IS NULL we finish the setup. If it's already
    //    populated, this is a genuine collision (real user reusing the
    //    same address) — refuse and tell them to use the login form.
    let newUserId: string;
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      const msg = createErr.message.toLowerCase();
      const alreadyExists = msg.includes('already') || msg.includes('registered') || msg.includes('exists');
      if (!alreadyExists) {
        throw new HttpError(500, `Hesab yaradılmadı: ${createErr.message}`);
      }
      // Look up the existing profile by email (case-insensitive match
      // since invite emails are lowercased on create.ts but auth.users
      // may not enforce that).
      const { data: existingProf, error: profLookupErr } = await sb
        .from('profiles')
        .select('id, role_id')
        .ilike('email', inv.email)
        .maybeSingle();
      if (profLookupErr) {
        throw new HttpError(500, `Mövcud profile axtarışı uğursuz: ${profLookupErr.message}`);
      }
      if (!existingProf) {
        // auth.users exists but no profile — atypical; safer to bail.
        throw new HttpError(
          409,
          'Bu email-də artıq hesab var, amma profile tapılmadı. Admin ilə əlaqə saxla.',
        );
      }
      if (existingProf.role_id) {
        // Fully-set-up profile: refuse to overwrite.
        throw new HttpError(
          409,
          'Bu email-də artıq hesab var. Şifrə ilə birbaşa daxil olmaq cəhd et.',
        );
      }
      // Half-baked profile from a previous crash: finish the setup with
      // the password the invitee just typed. We need to also reset the
      // auth password (the original signup might have used a different
      // one or none was stored). updateUserById sets it atomically.
      const { error: pwErr } = await sb.auth.admin.updateUserById(existingProf.id, { password });
      if (pwErr) {
        throw new HttpError(500, `Şifrə təyini uğursuz: ${pwErr.message}`);
      }
      newUserId = existingProf.id;
    } else {
      const id = created.user?.id;
      if (!id) throw new HttpError(500, 'Auth istifadəçisi qaytarılmadı');
      newUserId = id;
    }

    // 3. Attach role_id to the profile. ensure_profile RPC (migration 0025)
    //    creates the row if a trigger didn't, then we update role_id. Two
    //    steps because the RPC's signature only handles (id, email).
    const { error: ensureErr } = await sb.rpc('ensure_profile', {
      p_id: newUserId,
      p_email: inv.email,
    });
    if (ensureErr) {
      throw new HttpError(500, `Profile yaradılmadı: ${ensureErr.message}`);
    }
    const { error: roleErr } = await sb
      .from('profiles')
      .update({ role_id: inv.role_id })
      .eq('id', newUserId);
    if (roleErr) {
      throw new HttpError(500, `Rol təyini uğursuz: ${roleErr.message}`);
    }

    // 4. Mark the invitation accepted so it disappears from "Gözləyən
    //    dəvətlər" and can't be reused.
    const { error: acceptErr } = await sb
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inv.id);
    if (acceptErr) {
      throw new HttpError(500, `Dəvət bağlanmadı: ${acceptErr.message}`);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    await logAudit(sb, {
      actorId: newUserId,
      action: 'invitation.accepted',
      resource: `invitations:${inv.email}`,
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
      meta: { email: inv.email, role_id: inv.role_id, via: 'signup' },
    });

    // Email returned so the frontend can immediately call
    // supabase.auth.signInWithPassword(email, password) without having
    // had to know the email up-front.
    return jsonResponse({ ok: true, email: inv.email });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'invitations/signup');
