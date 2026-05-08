/**
 * MIRAI chat — Claude Haiku 4.5 with SSE streaming + conversation persistence.
 *
 * PRD anchors:
 *  - §3.1 model: claude-haiku-4-5-20251001 (Anthropic SDK).
 *  - §3.2 schema: writes mirai_conversations + 2× mirai_messages (user, assistant).
 *  - §3.4 Realtime: handoff occurs via mirai_messages:conversation_id. Other
 *    tabs/devices in the same conversation receive INSERT events via Supabase
 *    Realtime — no work needed on this endpoint beyond writing the rows.
 *  - §7.1 transport: SSE over this endpoint, $0.25 in / $1.25 out per Mtok,
 *    $5/user/month hard cap.
 *  - §7.4 RAG: top-5 cosine match on knowledge_base, citations injected into
 *    system prompt for legal + general personas.
 *  - §7.2 personas: persona enum aligned via migration 0007.
 *  - US-MIRAI-01: first token ≤800ms p95; usage logged to mirai_messages +
 *    mirai_usage_log.
 *
 * Wire format: Server-Sent Events. Three event types are emitted, each as a
 * JSON payload on a `data:` line followed by a blank line:
 *   { type: 'meta',   conversation_id, persona, sources }
 *   { type: 'delta',  text }                  // 0..N events
 *   { type: 'done',   reply, budget }         // exactly one
 *   { type: 'error',  message }               // mutually exclusive with done
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, requireUser } from '../_lib/auth';
import { embed } from '../_lib/embeddings';

export const config = { runtime: 'edge' };

const HARD_CAP_USD = 5;
const SOFT_WARN_FRACTION = 0.8;
const PRICE_IN_PER_MTOK = 0.25;
const PRICE_OUT_PER_MTOK = 1.25;
const RAG_PERSONAS = new Set(['legal', 'general']);

// PRD §7.2 + migration 0007.
type PersonaKey =
  | 'general'
  | 'project_manager'
  | 'finance_analyst'
  | 'cmo'
  | 'hr_partner'
  | 'legal'
  | 'strategist'
  | 'ops_director';

const PERSONAS: Record<PersonaKey, { system: string }> = {
  general: { system: 'You are MIRAI, the Komanda Köməkçisi for Reflect (an architecture studio in Baku). Be concise. Refuse to leak salaries, finance amounts, or other-user private data. Respond in Azerbaijani unless asked otherwise.' },
  ops_director: { system: 'You are MIRAI in Əməliyyat Direktoru persona. Surface bottlenecks across projects, deadlines, and team workload.' },
  project_manager: { system: 'You are MIRAI in Layihə Mühəndisi persona. Help triage tasks, deadlines, and project phases.' },
  finance_analyst: { system: 'You are MIRAI in Maliyyə Analitiki persona. Focus on cash flow, P&L, and forecast guidance. Never quote individual salaries.' },
  cmo: { system: 'You are MIRAI in Marketinq Direktoru (CMO) persona. Surface relevant trends, awards, and content opportunities.' },
  hr_partner: { system: 'You are MIRAI in HR persona (legacy). Career, performance, leave guidance.' },
  legal: { system: 'You are MIRAI in Hüquqşünas persona. Cite the AZ construction law / AZDNT chunks below; if the provided sources do not answer the question, reply exactly: "Bu məsələ üzrə dəqiq məlumatım yoxdur."' },
  strategist: { system: 'You are MIRAI in Strateq persona. Long-horizon firm strategy, competitive positioning, OKR coaching.' },
};

type Body = {
  message?: string;
  persona?: PersonaKey;
  conversation_id?: string;
};

function sseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(req: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  let body: Body;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    user = await requireUser(req);
    body = (await req.json()) as Body;
  } catch (e) {
    return errorResponse(e);
  }

  const message = (body.message ?? '').trim();
  if (!message) return errorResponse(new HttpError(400, 'Missing message'));
  const personaKey: PersonaKey =
    body.persona && PERSONAS[body.persona] ? body.persona : 'general';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return errorResponse(new HttpError(500, 'ANTHROPIC_API_KEY not configured'));

  const sb = admin();

  // Cost guardian — PRD §7.6. Pre-check; admins exempt (creator approximation).
  const period = new Date();
  const yyyymm = period.getUTCFullYear() * 100 + (period.getUTCMonth() + 1);
  const { data: usage } = await sb
    .from('mirai_usage_log')
    .select('cost_usd, tokens_in, tokens_out')
    .eq('user_id', user.id)
    .eq('period_yyyymm', yyyymm)
    .maybeSingle();
  const spent = Number(usage?.cost_usd ?? 0);
  if (!user.isAdmin && spent >= HARD_CAP_USD) {
    return errorResponse(new HttpError(429, 'Aylıq MIRAI limit dolub. Admin ilə əlaqə saxla.'));
  }

  // Resolve / create conversation row up front so the client receives the id
  // in the meta event and other devices can subscribe to the Realtime channel.
  let conversationId = body.conversation_id ?? null;
  if (conversationId) {
    const { data: existing } = await sb
      .from('mirai_conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!existing || existing.user_id !== user.id) {
      conversationId = null; // ignore unknown / foreign conversation ids
    }
  }
  if (!conversationId) {
    const { data: created, error } = await sb
      .from('mirai_conversations')
      .insert({ user_id: user.id, persona: personaKey })
      .select('id')
      .single();
    if (error || !created) {
      return errorResponse(new HttpError(500, error?.message ?? 'Could not create conversation'));
    }
    conversationId = created.id;
  }

  // RAG retrieval — see §7.4. Best-effort; failure must not break the chat.
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
      console.warn('[mirai] RAG retrieval failed:', e);
    }
    if (sources.length > 0) {
      ragSystem =
        '\n\nBilik bazasından çıxarışlar (cavab verərkən istinad et):\n' +
        sources
          .map((s) => `[Mənbə: ${s.source_pdf}, Maddə ${s.chunk_index}]\n${s.content}`)
          .join('\n\n---\n\n') +
        '\n\nƏgər yuxarıdakı çıxarışlar sualı tam cavablandırmırsa, dəqiq olaraq bu cümləni yaz: "Bu məsələ üzrə dəqiq məlumatım yoxdur."';
    } else if (personaKey === 'legal') {
      // Hard rule from PRD §7.4: legal persona must decline without sources.
      const finalReply = 'Bu məsələ üzrə dəqiq məlumatım yoxdur.';
      await persistMessages(sb, conversationId!, message, finalReply, 0, 0, 0);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent({
            type: 'meta',
            conversation_id: conversationId,
            persona: personaKey,
            sources: [],
          }));
          controller.enqueue(sseEvent({ type: 'delta', text: finalReply }));
          controller.enqueue(sseEvent({
            type: 'done',
            reply: finalReply,
            budget: { spent_usd: spent, cap_usd: HARD_CAP_USD, warn: false },
          }));
          controller.close();
        },
      });
      return sseResponse(stream);
    }
  }

  // Persist the user's message *before* streaming, so a mid-stream disconnect
  // still leaves the conversation history complete on the user side.
  await sb.from('mirai_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: message,
  });

  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(sseEvent({
          type: 'meta',
          conversation_id: conversationId,
          persona: personaKey,
          sources: sources.map((s) => ({
            source_pdf: s.source_pdf,
            chunk_index: s.chunk_index,
            similarity: s.similarity,
          })),
        }));

        let fullText = '';
        let tIn = 0;
        let tOut = 0;

        const anth = client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: PERSONAS[personaKey].system + ragSystem,
          messages: [{ role: 'user', content: message }],
        });

        anth.on('text', (textDelta) => {
          fullText += textDelta;
          controller.enqueue(sseEvent({ type: 'delta', text: textDelta }));
        });

        const final = await anth.finalMessage();
        tIn = final.usage?.input_tokens ?? 0;
        tOut = final.usage?.output_tokens ?? 0;

        const reply = fullText.trim() || 'Cavab boş gəldi.';
        const cost = (tIn / 1_000_000) * PRICE_IN_PER_MTOK + (tOut / 1_000_000) * PRICE_OUT_PER_MTOK;

        await Promise.all([
          persistMessages(sb, conversationId!, message, reply, tIn, tOut, cost, /* userInsertedAlready */ true),
          sb.from('mirai_usage_log').upsert(
            {
              user_id: user.id,
              period_yyyymm: yyyymm,
              tokens_in: Number(usage?.tokens_in ?? 0) + tIn,
              tokens_out: Number(usage?.tokens_out ?? 0) + tOut,
              cost_usd: spent + cost,
            },
            { onConflict: 'user_id,period_yyyymm' },
          ),
          sb
            .from('mirai_conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId!),
        ]);

        const totalSpent = spent + cost;
        controller.enqueue(sseEvent({
          type: 'done',
          reply,
          budget: {
            spent_usd: totalSpent,
            cap_usd: HARD_CAP_USD,
            warn: totalSpent >= HARD_CAP_USD * SOFT_WARN_FRACTION,
          },
        }));
      } catch (e) {
        controller.enqueue(sseEvent({ type: 'error', message: (e as Error).message }));
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

async function persistMessages(
  sb: ReturnType<typeof admin>,
  conversationId: string,
  userMessage: string,
  assistantReply: string,
  tIn: number,
  tOut: number,
  cost: number,
  userAlreadyInserted = false,
) {
  if (!userAlreadyInserted) {
    await sb.from('mirai_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
    });
  }
  await sb.from('mirai_messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: assistantReply,
    tokens_in: tIn,
    tokens_out: tOut,
    cost_usd: cost,
  });
}
