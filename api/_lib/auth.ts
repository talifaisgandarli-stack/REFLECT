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
 * PRD §9.1 rate limiting: Upstash Redis sliding window.
 * Limits: 100 req/min admin, 30 req/min user, 10 req/min anonymous.
 * Call with the AuthedUser result (or null for anonymous) and a request key (IP or userId).
 * Throws HttpError(429) if limit exceeded.
 */
export async function rateLimit(
  user: AuthedUser | null,
  identifier: string,
): Promise<void> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  // If Upstash is not configured, skip rate limiting (local dev / CI).
  if (!redisUrl || !redisToken) return;

  const limit = user?.isAdmin ? 100 : user ? 30 : 10;
  const windowSec = 60;
  const key = `rl:${user?.id ?? `anon:${identifier}`}`;
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  // Upstash REST pipeline: ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE
  const pipeline = [
    ['ZREMRANGEBYSCORE', key, '-inf', windowStart],
    ['ZADD', key, now, `${now}-${Math.random()}`],
    ['ZCARD', key],
    ['EXPIRE', key, windowSec],
  ];

  const res = await fetch(`${redisUrl}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${redisToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(pipeline),
  });

  if (!res.ok) return; // fail-open: don't block on Redis errors

  const results = await res.json() as Array<{ result: number }>;
  const count = results[2]?.result ?? 0;
  if (count > limit) {
    throw new HttpError(429, `Çox tez-tez sorğu. Gözləyin (${limit} sorğu/dəq).`);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * PRD §3.2 / §9.4: Write to audit_log for any privileged action (role change,
 * settings update, invite creation). Best-effort — never throws.
 */
export async function writeAuditLog(
  actorId: string,
  action: string,
  resource: string,
  req: Request,
): Promise<void> {
  try {
    const sb = admin();
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;
    await sb.from('audit_log').insert({ actor_id: actorId, action, resource, ip, user_agent: userAgent });
  } catch {
    // best-effort — audit failure must never block the primary action
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
