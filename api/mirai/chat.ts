/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK.
 * PRD §3.1, §7.1 (pricing + cap), §7.4 (RAG), §7.6 (cost guardian).
 *
 * Pricing per PRD §7.1: $0.25/1M input, $1.25/1M output.
 * Cap per PRD §7.1: $5/user/calendar-month, creator exempt.
 * RAG per PRD §7.4: top-5 cosine match on knowledge_base; citations of the
 * form "Mənbə: <source_pdf>, Maddə <chunk_index>"; empty-result guard
 * forces the "Bu məsələ üzrə dəqiq məlumatım yoxdur" response.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { embed } from '../_lib/embeddings';

export const config = { runtime: 'edge' };

const HARD_CAP_USD = 5;
const SOFT_WARN_FRACTION = 0.8;
const PRICE_IN_PER_MTOK = 0.25;
const PRICE_OUT_PER_MTOK = 1.25;
const RAG_PERSONAS = new Set(['legal', 'general']);

type PersonaKey =
  | 'general'
  | 'project_manager'
  | 'finance_analyst'
  | 'cmo'
  | 'hr_partner'
  | 'legal'
  | 'strategist';

const PERSONAS: Record<PersonaKey, { system: string }> = {
  general: { system: 'You are MIRAI, the in-house assistant for Reflect (an architecture studio in Baku). Be concise. Refuse to leak salaries, finance amounts, or other-user private data. Respond in Azerbaijani unless asked otherwise.' },
  project_manager: { system: 'You are MIRAI in Layihə Mühəndisi persona. Help triage tasks, deadlines, and project phases.' },
  finance_analyst: { system: 'You are MIRAI in Maliyyə Analitiki persona. Focus on cash flow, P&L, and forecast guidance. Never quote individual salaries.' },
  cmo: { system: 'You are MIRAI in Marketinq Direktoru (CMO) persona. Surface relevant trends, awards, and content opportunities.' },
  hr_partner: { system: 'You are MIRAI in HR / Strateq persona. Career, performance, leave guidance.' },
  legal: { system: 'You are MIRAI in Hüquqşünas persona. Cite the AZ construction law / AZDNT chunks below; if the provided sources do not answer the question, reply exactly: "Bu məsələ üzrə dəqiq məlumatım yoxdur."' },
  strategist: { system: 'You are MIRAI in Strateq persona. Long-horizon firm strategy, competitive positioning, OKR coaching.' },
};

type Body = {
  message?: string;
  persona?: PersonaKey;
  conversation_id?: string;
};

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const body = (await req.json()) as Body;
    const message = (body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'Missing message');
    const personaKey: PersonaKey =
      body.persona && PERSONAS[body.persona] ? body.persona : 'general';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();

    // Cost guardian — PRD §7.6.
    const period = new Date();
    const yyyymm = period.getUTCFullYear() * 100 + (period.getUTCMonth() + 1);
    const { data: usage } = await sb
      .from('mirai_usage_log')
      .select('cost_usd, tokens_in, tokens_out')
      .eq('user_id', user.id)
      .eq('period_yyyymm', yyyymm)
      .maybeSingle();
    const spent = Number(usage?.cost_usd ?? 0);
    // Creator exempt per PRD §7.6 — we approximate "creator" with isAdmin
    // here. Actual is_creator flag check requires reading profiles; this
    // endpoint already trusts requireUser to set isAdmin, and creator is
    // always admin. Documented gap: a non-creator admin is also exempt.
    if (!user.isAdmin && spent >= HARD_CAP_USD) {
      throw new HttpError(429, 'Aylıq MIRAI limit dolub. Admin ilə əlaqə saxla.');
    }

    // RAG — PRD §7.4. Skipped for personas where it adds no value (CMO is
    // grounded in feed posts, finance/HR have role-scoped data via tools, etc.).
    let sources: { source_pdf: string; chunk_index: number; content: string; similarity: number }[] = [];
    let ragSystem = '';
    if (RAG_PERSONAS.has(personaKey)) {
      try {
        const [vec] = await embed(message);
        if (vec) {
          const { data: hits } = await sb.rpc('match_knowledge_base', {
            query_embedding: vec,
            match_count: 5,
          });
          sources = (hits ?? []).filter((h: { similarity: number }) => h.similarity >= 0.3);
        }
      } catch (e) {
        // Embedding/RPC failure must not break the chat — degrade to no-RAG.
        // eslint-disable-next-line no-console
        console.warn('[mirai] RAG retrieval failed:', e);
      }
      if (sources.length > 0) {
        ragSystem =
          '\n\nBilik bazasından çıxarışlar (cavab verərkən istinad et):\n' +
          sources
            .map(
              (s) =>
                `[Mənbə: ${s.source_pdf}, Maddə ${s.chunk_index}]\n${s.content}`,
            )
            .join('\n\n---\n\n') +
          '\n\nƏgər yuxarıdakı çıxarışlar sualı tam cavablandırmırsa, dəqiq olaraq bu cümləni yaz: "Bu məsələ üzrə dəqiq məlumatım yoxdur."';
      } else if (personaKey === 'legal') {
        // Legal persona without sources MUST decline (PRD §7.4 hard rule).
        return jsonResponse({
          reply: 'Bu məsələ üzrə dəqiq məlumatım yoxdur.',
          persona: personaKey,
          sources: [],
        });
      }
    }

    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: PERSONAS[personaKey].system + ragSystem,
      messages: [{ role: 'user', content: message }],
    });

    const reply =
      completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim() || 'Cavab boş gəldi.';

    const tIn = completion.usage?.input_tokens ?? 0;
    const tOut = completion.usage?.output_tokens ?? 0;
    const cost = (tIn / 1_000_000) * PRICE_IN_PER_MTOK + (tOut / 1_000_000) * PRICE_OUT_PER_MTOK;

    await sb.from('mirai_usage_log').upsert(
      {
        user_id: user.id,
        period_yyyymm: yyyymm,
        tokens_in: Number(usage?.tokens_in ?? 0) + tIn,
        tokens_out: Number(usage?.tokens_out ?? 0) + tOut,
        cost_usd: spent + cost,
      },
      { onConflict: 'user_id,period_yyyymm' },
    );

    return jsonResponse({
      reply,
      persona: personaKey,
      sources: sources.map((s) => ({
        source_pdf: s.source_pdf,
        chunk_index: s.chunk_index,
        similarity: s.similarity,
      })),
      budget: {
        spent_usd: spent + cost,
        cap_usd: HARD_CAP_USD,
        warn: spent + cost >= HARD_CAP_USD * SOFT_WARN_FRACTION,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
