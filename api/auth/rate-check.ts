/**
 * Server-side login rate limit gate (REQ-AUTH-01 / PRD §5).
 * Migration 0031 creates login_attempts table + check/record RPCs.
 *
 * Client calls POST /api/auth/rate-check BEFORE calling Supabase signIn.
 * Returns { allowed: true } or { allowed: false } with HTTP 429.
 * Caller MUST abort sign-in on 429.
 */
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('Supabase server env missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Vercel injects the real client IP; fall back to 'unknown' so the RPC
  // still runs (it will count against one shared bucket rather than error).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  let email = 'unknown';
  try {
    const body = await req.json();
    if (typeof body?.email === 'string') email = body.email.trim().toLowerCase();
  } catch {
    // body is optional — proceed without email
  }

  try {
    const sb = serviceClient();

    const { data: allowed, error: checkErr } = await sb.rpc('check_login_rate', { p_ip: ip });
    if (checkErr) {
      // RPC error → fail-open so a DB hiccup doesn't lock everyone out.
      return new Response(JSON.stringify({ allowed: true, warn: 'rate-check-unavailable' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Record the attempt whether allowed or not (for audit trail).
    await sb.rpc('record_login_attempt', { p_ip: ip, p_email: email }).then(null, () => null);

    if (!allowed) {
      return new Response(JSON.stringify({ allowed: false, error: 'Çox sayda cəhd. 15 dəqiqə gözləyin.' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '900' },
      });
    }

    return new Response(JSON.stringify({ allowed: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    // fail-open
    return new Response(JSON.stringify({ allowed: true, warn: 'rate-check-error' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
}
