/**
 * MIRAI ICP enrichment — REQ-CRM-04
 *
 * Computes ai_icp_fit (0–100) for a client using Claude Haiku 4.5.
 * Cached: refreshes at most 1×/24h per client (PRD REQ-CRM-04).
 * Admin-only — clients table is admin-gated.
 *
 * POST /api/mirai/icp
 * Body: { client_id: string }
 * Returns: { icp_fit: number, cached: boolean }
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001'; // PRD §3.1

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const { client_id } = (await req.json()) as { client_id?: string };
    if (!client_id) throw new HttpError(400, 'client_id required');

    const sb = admin();

    // Fetch client row
    const { data: client, error: cErr } = await sb
      .from('clients')
      .select('id, name, company, email, phone, pipeline_stage, expected_value, ai_icp_fit, ai_icp_calculated_at')
      .eq('id', client_id)
      .maybeSingle();
    if (cErr || !client) throw new HttpError(404, 'Client not found');

    // PRD REQ-CRM-04: cached until inputs change; refresh max 1×/24h/client
    if (client.ai_icp_calculated_at) {
      const age = Date.now() - new Date(client.ai_icp_calculated_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return jsonResponse({ icp_fit: client.ai_icp_fit, cached: true });
      }
    }

    const ai = new Anthropic();
    const msg = await ai.messages.create({
      model: MODEL,
      max_tokens: 64,
      system:
        'Sən Reflect arxitektura studiyasının MIRAI köməkçisinin ICP (Ideal Customer Profile) qiymətləndirmə modulusan. ' +
        'Verilən müştəri məlumatlarına əsaslanaraq, müştərinin Reflect üçün uyğunluq faizini 0-100 arasında bir rəqəmlə qiymətləndir. ' +
        'Cavabda YALNIZ bir tam ədəd qaytar (məs: 72). Başqa heç nə yazma.',
      messages: [
        {
          role: 'user',
          content: `Müştəri məlumatları:
Ad: ${client.name}
Şirkət: ${client.company ?? 'Bilinmir'}
Email: ${client.email ?? 'Yoxdur'}
Telefon: ${client.phone ?? 'Yoxdur'}
Pipeline mərhələsi: ${client.pipeline_stage}
Gözlənilən dəyər: ${client.expected_value != null ? `${client.expected_value} AZN` : 'Bilinmir'}

ICP uyğunluq faizini (0-100) qaytar:`,
        },
      ],
    });

    const raw = (msg.content[0] as { type: string; text?: string }).text?.trim() ?? '0';
    const icp_fit = Math.min(100, Math.max(0, parseInt(raw, 10) || 0));

    // Persist to clients table (PRD §3.2 ai_icp_fit + ai_icp_calculated_at columns)
    await sb
      .from('clients')
      .update({ ai_icp_fit: icp_fit, ai_icp_calculated_at: new Date().toISOString() })
      .eq('id', client_id);

    return jsonResponse({ icp_fit, cached: false });
  } catch (e) {
    return errorResponse(e);
  }
}
