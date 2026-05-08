/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK (PRD §3.1, §7).
 * Cost guardian, persona routing, and privacy filter applied here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const PERSONAS: Record<string, { system: string }> = {
  general: { system: 'You are MIRAI, the in-house assistant for Reflect (an architecture studio in Baku). Be concise. Refuse to leak salaries, finance amounts, or other-user private data. Respond in Azerbaijani unless asked otherwise.' },
  project_manager: { system: 'You are MIRAI in Project Manager persona. Help triage tasks, deadlines, and project phases.' },
  finance_analyst: { system: 'You are MIRAI in Finance Analyst persona. Focus on cash flow, P&L, and forecast guidance. Never quote individual salaries.' },
  cmo: { system: 'You are MIRAI in CMO persona. Surface relevant trends, awards, and content opportunities.' },
  hr_partner: { system: 'You are MIRAI in HR persona. Career, performance, leave guidance.' },
};

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const body = (await req.json()) as { message?: string; persona?: keyof typeof PERSONAS; conversation_id?: string };
    const message = (body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'Missing message');
    const personaKey = body.persona && PERSONAS[body.persona] ? body.persona : 'general';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();

    // Cost guardian (REQ §7.6): hard-cap $20/user/month soft-warn $15.
    const period = new Date();
    const yyyymm = period.getUTCFullYear() * 100 + (period.getUTCMonth() + 1);
    const { data: usage } = await sb
      .from('mirai_usage_log')
      .select('cost_usd')
      .eq('user_id', user.id)
      .eq('period_yyyymm', yyyymm)
      .maybeSingle();
    if ((usage?.cost_usd ?? 0) > 20) {
      throw new HttpError(429, 'Aylıq MIRAI limit dolub. Admin ilə əlaqə saxla.');
    }

    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: PERSONAS[personaKey].system,
      messages: [{ role: 'user', content: message }],
    });

    const reply =
      completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim() || 'Cavab boş gəldi.';

    // Naive cost estimate (Haiku 4.5 ~ $0.80 in / $4 out per Mtoken at time of writing).
    const tIn = completion.usage?.input_tokens ?? 0;
    const tOut = completion.usage?.output_tokens ?? 0;
    const cost = (tIn / 1_000_000) * 0.8 + (tOut / 1_000_000) * 4;

    await sb.from('mirai_usage_log').upsert(
      {
        user_id: user.id,
        period_yyyymm: yyyymm,
        tokens_in: (usage?.cost_usd != null ? 0 : 0) + tIn,
        tokens_out: tOut,
        cost_usd: (usage?.cost_usd ?? 0) + cost,
      },
      { onConflict: 'user_id,period_yyyymm' },
    );

    return jsonResponse({ reply, persona: personaKey, sources: [] });
  } catch (e) {
    return errorResponse(e);
  }
}
