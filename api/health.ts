/**
 * Health check endpoint — PRD §9.3.
 * Returns DB + AI provider status; used by external uptime monitors and
 * Vercel's deployment health probes. Public (no auth) so monitors can hit it.
 *
 * Status: "ok" when DB and Anthropic both reachable. "degraded" when one
 * sub-system is down. "down" when DB itself is unreachable.
 */
import { admin, errorResponse, jsonResponse } from './_lib/auth';
import { withSentry } from './_lib/sentry';

export const config = { runtime: 'edge' };

async function handler(_req: Request) {
  try {
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

    // DB ping — cheapest possible read against system_settings.
    const dbStart = Date.now();
    try {
      const sb = admin();
      const { error } = await sb.from('system_settings').select('key').limit(1);
      checks.db = error ? { ok: false, error: error.message } : { ok: true, ms: Date.now() - dbStart };
    } catch (e) {
      checks.db = { ok: false, error: (e as Error).message };
    }

    // Anthropic reachability (no token spend — just resolves DNS + TLS).
    const aiStart = Date.now();
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        checks.ai = { ok: false, error: 'ANTHROPIC_API_KEY missing' };
      } else {
        // HEAD-ish probe: the messages endpoint will 405 on GET, which
        // is fine — we only care that the host is reachable.
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'GET',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        });
        // Any status from 200..599 means the host answered.
        checks.ai = { ok: res.status > 0, ms: Date.now() - aiStart };
      }
    } catch (e) {
      checks.ai = { ok: false, error: (e as Error).message };
    }

    const allOk = checks.db?.ok && checks.ai?.ok;
    const status = !checks.db?.ok ? 'down' : allOk ? 'ok' : 'degraded';

    return jsonResponse({ status, checks, timestamp: new Date().toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'health');
