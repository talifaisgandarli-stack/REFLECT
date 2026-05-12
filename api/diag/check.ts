/**
 * Diagnostic endpoint — returns environment + auth state.
 * Public: returns env flags only. With Authorization header: also returns
 * auth user + profile lookup for that token.
 * No secret values are ever returned (booleans only).
 *
 * GET /api/diag/check  (no auth → env flags only)
 * GET /api/diag/check  with Authorization: Bearer <token> → full diagnostics
 */
import { admin, errorResponse, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    // Env diagnostics (names only; never echo values)
    const env = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      CRON_SECRET: !!process.env.CRON_SECRET,
    };

    // Service-role key sanity: decode the JWT payload and check the "role" claim.
    // anon and service_role keys are JWTs signed with the same secret; the only
    // difference is `role: "anon"` vs `role: "service_role"` in the payload.
    let serviceKeyRole: string | null = null;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (key) {
      try {
        const payload = key.split('.')[1];
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        serviceKeyRole = decoded.role ?? 'unknown';
      } catch {
        serviceKeyRole = 'invalid_jwt';
      }
    }

    // Feature flags derived from env presence — safe to expose, never include secrets.
    const features = {
      rag_enabled: !!process.env.GOOGLE_API_KEY,
      telegram_enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_WEBHOOK_SECRET,
      email_enabled: !!process.env.RESEND_API_KEY,
      mirai_enabled: !!process.env.ANTHROPIC_API_KEY,
    };

    // List available Gemini models for the configured key — helps diagnose
    // "model not found" errors by showing what the key actually has access to.
    let geminiModels: string[] | { error: string } = [];
    if (process.env.GOOGLE_API_KEY) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
          geminiModels = (data.models ?? [])
            .filter((m) => m.supportedGenerationMethods?.includes('embedContent'))
            .map((m) => m.name);
        } else {
          geminiModels = { error: `ListModels failed (${res.status})` };
        }
      } catch (e) {
        geminiModels = { error: (e as Error).message };
      }
    }

    if (!token) {
      return jsonResponse({ ok: false, env, serviceKeyRole, features, geminiModels, note: 'Send Authorization: Bearer <token> for full diagnostics' });
    }

    const sb = admin();
    const { data: authData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !authData?.user) {
      return jsonResponse({ ok: false, env, serviceKeyRole, authError: authErr?.message ?? 'no user' });
    }

    const authUser = authData.user;

    const { data: prof, error: profErr } = await sb
      .from('profiles')
      .select('id, email, is_creator, is_active, role_id')
      .eq('id', authUser.id)
      .maybeSingle();

    return jsonResponse({
      ok: true,
      env,
      serviceKeyRole,
      features,
      geminiModels,
      authUserId: authUser.id,
      authEmail: authUser.email,
      profile: prof ?? null,
      profileError: profErr?.message ?? null,
      profileMatchesAuth: prof?.id === authUser.id,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
