/**
 * Public read of a pending invitation by token. Lets the signup form show
 * the email + role the invitee is about to claim before they create a
 * password, so they can confirm the right invite ("yox, bu mənim email-im
 * deyil"). No auth required — possession of the token is the grant; the
 * caller just learns who the invite is FOR, not enough to act on it
 * (acting requires the signup endpoint + a password).
 */
import { z } from 'zod';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

const Query = z.object({ token: z.string().uuid() });

async function handler(req: Request) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const url = new URL(req.url);
    const parsed = Query.safeParse({ token: url.searchParams.get('token') ?? '' });
    if (!parsed.success) throw new HttpError(400, 'Invalid token');

    const sb = admin();
    const { data: inv, error } = await sb
      .from('invitations')
      .select('email, expires_at, accepted_at, role:roles(name)')
      .eq('token', parsed.data.token)
      .maybeSingle<{
        email: string;
        expires_at: string;
        accepted_at: string | null;
        role: { name: string } | null;
      }>();
    if (error) throw new HttpError(500, error.message);
    if (!inv) throw new HttpError(404, 'Dəvət tapılmadı');
    if (inv.accepted_at) throw new HttpError(410, 'Dəvət artıq qəbul edilib');
    if (new Date(inv.expires_at) < new Date()) throw new HttpError(410, 'Dəvətin müddəti bitib');

    return jsonResponse({
      email: inv.email,
      role_name: inv.role?.name ?? null,
      expires_at: inv.expires_at,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'invitations/info');
