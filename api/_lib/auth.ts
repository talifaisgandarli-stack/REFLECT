/**
 * Server-side request auth: every /api/* endpoint MUST call requireUser()
 * to verify the JWT and resolve role from DB (never trust headers — PRD §3.3).
 */
import { createClient } from '@supabase/supabase-js';

export type AuthedUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  isCreator: boolean;
  roleKey: string | null;
  /** Bearer token, forwarded for RLS-scoped supabase clients (PRD §7.3). */
  token: string;
};

export function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('Supabase server env missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requireUser(req: Request): Promise<AuthedUser> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token', 'missing_bearer');

  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Invalid token', 'invalid_token');

  const { data: prof } = await sb
    .from('profiles')
    .select('id, email, is_creator, role_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!prof) throw new HttpError(403, 'No profile', 'no_profile');

  let roleKey: string | null = null;
  let roleAdmin = false;
  if (prof.role_id) {
    const { data: role } = await sb.from('roles').select('key, is_admin').eq('id', prof.role_id).maybeSingle();
    roleKey = role?.key ?? null;
    roleAdmin = !!role?.is_admin;
  }

  return {
    id: prof.id,
    email: prof.email,
    isAdmin: prof.is_creator || roleAdmin,
    isCreator: !!prof.is_creator,
    roleKey,
    token,
  };
}

/**
 * RLS-scoped client (PRD §7.3): queries run with the user's JWT, so any tool
 * call MIRAI invokes can never see rows the user themselves can't read.
 * Use this — not admin() — anywhere a request acts on behalf of a user.
 */
export function userClient(token: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url || !anon) throw new Error('Supabase server env missing');
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Stable error code derived from HTTP status when a callsite doesn't
 * provide one. Clients can branch on `code` instead of parsing the
 * human message — see /api error envelope (slice 128).
 */
function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 405:
      return 'method_not_allowed';
    case 409:
      return 'conflict';
    case 413:
      return 'payload_too_large';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : 'error';
  }
}

export class HttpError extends Error {
  public readonly code: string;

  constructor(public status: number, message: string, code?: string) {
    super(message);
    this.code = code ?? defaultCodeForStatus(status);
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Standardized error envelope (slice 128, PRD §11.3). Always returns
 * `{ error: <human>, code: <stable_id> }`. Internal errors collapse to
 * a generic message + code='internal_error'; the original throw is
 * still console.errored for log forensics. HttpError keeps its
 * caller-provided code so clients can branch on stable identifiers.
 */
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return jsonResponse({ error: e.message, code: e.code }, e.status);
  }
  // eslint-disable-next-line no-console
  console.error('[api]', e);
  return jsonResponse(
    { error: 'Internal error', code: 'internal_error' },
    500,
  );
}
