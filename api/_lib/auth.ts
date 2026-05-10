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
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Invalid token');

  const authUser = data.user;

  // Defense-in-depth: if profile row missing (auto-create trigger didn't fire,
  // or migration not applied yet), self-heal on the fly. This guarantees that
  // any authenticated auth.users row also has a profiles row by the time we
  // return — no more "No profile" 403s, ever.
  let { data: prof } = await sb
    .from('profiles')
    .select('id, email, is_creator, role_id, is_active')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!prof) {
    const { data: created, error: insertErr } = await sb
      .from('profiles')
      .insert({
        id: authUser.id,
        email: authUser.email ?? '',
        is_active: true,
        is_creator: false,
      })
      .select('id, email, is_creator, role_id, is_active')
      .single();
    if (insertErr || !created) {
      // Surface what actually went wrong instead of the generic 403.
      throw new HttpError(500, `Profile auto-create failed: ${insertErr?.message ?? 'unknown'}`);
    }
    prof = created;
  }

  if (prof.is_active === false) {
    throw new HttpError(403, 'Account is deactivated');
  }

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
