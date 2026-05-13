/**
 * Server-side request auth: every /api/* endpoint MUST call requireUser()
 * to verify the JWT and resolve role from DB (never trust headers — PRD §3.3).
 */
import { createClient } from '@supabase/supabase-js';

// Defense-in-depth: reject state-changing requests from unexpected origins.
// The API already requires a Bearer JWT so true CSRF is not possible, but
// an extra Origin check prevents abuse from rogue browser tabs or extensions.
const ALLOWED_ORIGINS = (() => {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.PUBLIC_APP_URL ?? '';
  const base = raw.split(',').map((s) => s.trim()).filter(Boolean);
  // Always allow localhost for local dev.
  return [...base, 'http://localhost:5173', 'http://localhost:4173'];
})();

function originAllowed(req: Request): boolean {
  // GET/HEAD/OPTIONS are safe methods — no origin check needed.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.get('origin');
  if (!origin) return true; // server-to-server call (cron, webhook) — allow
  return ALLOWED_ORIGINS.some(
    (allowed) => origin === allowed || origin.endsWith('.vercel.app'),
  );
}

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
  if (!originAllowed(req)) throw new HttpError(403, 'Origin not allowed');

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
    // Call SECURITY DEFINER RPC (migration 0025) — runs as postgres superuser
    // so it bypasses any service_role GRANT gaps. Returns the row whether it
    // already existed or was just created.
    const { data: ensured, error: rpcErr } = await sb.rpc('ensure_profile', {
      p_id: authUser.id,
      p_email: authUser.email ?? '',
    });
    if (rpcErr) {
      throw new HttpError(500, `ensure_profile RPC failed: ${rpcErr.message}`);
    }
    const row = Array.isArray(ensured) ? ensured[0] : ensured;
    if (!row) throw new HttpError(500, 'ensure_profile returned no row');
    prof = row as NonNullable<typeof prof>;
  }

  if (!prof) throw new HttpError(500, 'profile unexpectedly null');
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
