/**
 * Server-side ICP (Ideal Customer Profile) fit scorer — REQ-CRM-04.
 *
 * Throttle: max 1 run per client per 24h, enforced server-side so a
 * client-side bypass (direct Supabase write) cannot circumvent the limit.
 *
 * Flow:
 *   1. Verify auth + admin/bd_lead role.
 *   2. Load client row, check ai_icp_calculated_at (24h throttle).
 *   3. Call /api/mirai/chat internally with a structured prompt.
 *   4. Parse numeric score 0-100 from reply.
 *   5. Write ai_icp_fit + ai_icp_calculated_at back to clients table.
 *   6. Return { score }.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const THROTTLE_HOURS = 24;

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin && user.roleKey !== 'bd_lead') throw new HttpError(403, 'Admin or BD Lead required');

    const { client_id } = (await req.json()) as { client_id?: string };
    if (!client_id) throw new HttpError(400, 'client_id required');

    const sb = admin();

    // Load client
    const { data: client, error: selErr } = await sb
      .from('clients')
      .select('id, name, company, email, phone, ai_icp_calculated_at')
      .eq('id', client_id)
      .maybeSingle();
    if (selErr) throw new HttpError(500, selErr.message);
    if (!client) throw new HttpError(404, 'Client not found');

    // Server-side 24h throttle
    if (client.ai_icp_calculated_at) {
      const hoursSince = (Date.now() - new Date(client.ai_icp_calculated_at).getTime()) / 3_600_000;
      if (hoursSince < THROTTLE_HOURS) {
        const expiresInH = Math.ceil(THROTTLE_HOURS - hoursSince);
        return jsonResponse({ throttled: true, expires_in_hours: expiresInH }, 429);
      }
    }

    // Call MIRAI chat endpoint — tool-free, just text response
    const appUrl = process.env.PUBLIC_APP_URL ?? req.headers.get('origin') ?? '';
    const chatRes = await fetch(`${appUrl}/api/mirai/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: req.headers.get('authorization') ?? '',
      },
      body: JSON.stringify({
        persona: 'operations_director',
        message: [
          `Müştəri: ${client.name}.`,
          `Şirkət: ${client.company ?? '—'}.`,
          `Email: ${client.email ?? '—'}.`,
          'Bu müştərinin ICP (Ideal Customer Profile) uyğunluğunu 0-100 arasında qiymətləndir.',
          'Yalnız rəqəm cavab ver (məsələn: 72).',
        ].join(' '),
      }),
    });

    if (!chatRes.ok) throw new HttpError(502, 'AI chat unavailable');
    const chatData = (await chatRes.json()) as { reply?: string };
    const match = String(chatData.reply ?? '').match(/\d+/);
    if (!match) throw new HttpError(502, 'AI returned no numeric score');
    const score = Math.min(100, Math.max(0, Number(match[0])));

    // Persist
    const { error: updErr } = await sb
      .from('clients')
      .update({ ai_icp_fit: score, ai_icp_calculated_at: new Date().toISOString() })
      .eq('id', client_id);
    if (updErr) throw new HttpError(500, updErr.message);

    return jsonResponse({ score });
  } catch (e) {
    return errorResponse(e);
  }
}
