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
};

export function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('Supabase server env missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Supabase client that forwards the caller's JWT, so PostgREST applies RLS
 * as the authenticated user. Use for any read/write that should respect the
 * user's permissions (e.g. /api/search).
 */
export function userClient(req: Request) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!url || !anon) throw new Error('Supabase server env missing');
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: auth ? { Authorization: auth } : {} },
  });
}

export async function requireUser(req: Request): Promise<AuthedUser> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Invalid token');

  const { data: prof } = await sb
    .from('profiles')
    .select('id, email, is_creator, role_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!prof) throw new HttpError(403, 'No profile');

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
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status);
  // eslint-disable-next-line no-console
  console.error('[api]', e);
  return jsonResponse({ error: 'Internal error' }, 500);
}
