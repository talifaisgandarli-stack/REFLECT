/**
 * CRM ICP enrichment — REQ-CRM-04 / US-CRM-03.
 *
 * POST /api/crm/icp  { client_id }
 * Admin only. Uses Claude Haiku to score ai_icp_fit ∈ {Excellent/Good/Medium/Low}.
 * Rate-limited: 1 call per client per 24h (ai_icp_calculated_at guard).
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser, rateLimit } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001'; // PRD §3.1
const FIT_VALUES = ['Excellent', 'Good', 'Medium', 'Low'] as const;
type IcpFit = (typeof FIT_VALUES)[number];

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    await rateLimit(user, user.id);
    if (!user.isAdmin) throw new HttpError(403, 'Yalnız adminlər üçündür.');

    const body = (await req.json()) as { client_id?: string };
    const clientId = body.client_id?.trim();
    if (!clientId) throw new HttpError(400, 'client_id tələb olunur');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();

    // Fetch client with interaction history
    const { data: client } = await sb
      .from('clients')
      .select('id, name, company, pipeline_stage, expected_value, confidence_pct, ai_icp_calculated_at')
      .eq('id', clientId)
      .maybeSingle();
    if (!client) throw new HttpError(404, 'Müştəri tapılmadı');

    // Rate-limit: 1×/24h per client (PRD REQ-CRM-04)
    if (client.ai_icp_calculated_at) {
      const age = Date.now() - new Date(client.ai_icp_calculated_at).getTime();
      if (age < 24 * 3_600_000) {
        throw new HttpError(429, 'ICP analizi son 24 saatda artıq edilib. Sabah yenidən cəhd edin.');
      }
    }

    // Gather context
    const { data: interactions } = await sb
      .from('client_interactions')
      .select('type, note, occurred_at')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .limit(10);

    const { data: projects } = await sb
      .from('projects')
      .select('name, status, phases')
      .eq('client_id', clientId)
      .limit(5);

    const prompt = `Sən bir arxitektura studiyasının CRM analitiksən.
Aşağıdakı müştəri məlumatlarına əsasən ICP (İdeal Müştəri Profili) uyğunluğunu qiymətləndir.

Müştəri:
- Ad: ${client.name}
- Şirkət: ${client.company ?? 'Bilinmir'}
- Mərhələ: ${client.pipeline_stage}
- Gözlənilən dəyər: ${client.expected_value ?? 0} AZN
- Ehtimal: ${client.confidence_pct ?? 0}%

Son qarşılıqlı əlaqələr (${(interactions ?? []).length} ədəd):
${(interactions ?? []).map((i) => `- ${i.type}: ${i.note ?? '—'}`).join('\n') || '— yoxdur'}

Layihə tarixi:
${(projects ?? []).map((p) => `- ${p.name} (${p.status})`).join('\n') || '— yoxdur'}

Yalnız bu 4 dəyərdən birini cavab ver (başqa söz yazma):
Excellent
Good
Medium
Low`;

    const anthropic = new Anthropic({ apiKey });
    const completion = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();

    const fit = FIT_VALUES.find((v) => raw.startsWith(v));
    if (!fit) throw new HttpError(500, `MIRAI gözlənilməz cavab verdi: ${raw}`);

    await sb
      .from('clients')
      .update({ ai_icp_fit: fit, ai_icp_calculated_at: new Date().toISOString() })
      .eq('id', clientId);

    return jsonResponse({ ok: true, ai_icp_fit: fit });
  } catch (e) {
    return errorResponse(e);
  }
}
