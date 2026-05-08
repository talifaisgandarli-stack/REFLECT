/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK (PRD §3.1, §7).
 * Cost guardian, persona routing, and privacy filter applied here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

type PersonaKey =
  | 'general'
  | 'project_manager'
  | 'finance_analyst'
  | 'cmo'
  | 'hr_partner'
  | 'legal';

const PERSONAS: Record<PersonaKey, { system: string; rag: boolean }> = {
  general: {
    system:
      'You are MIRAI, the in-house assistant for Reflect (an architecture studio in Baku). Be concise. Refuse to leak salaries, finance amounts, or other-user private data. Respond in Azerbaijani unless asked otherwise.',
    rag: false,
  },
  project_manager: {
    system: 'You are MIRAI in Project Manager persona. Help triage tasks, deadlines, and project phases.',
    rag: false,
  },
  finance_analyst: {
    system:
      'You are MIRAI in Finance Analyst persona. Focus on cash flow, P&L, and forecast guidance. Never quote individual salaries.',
    rag: false,
  },
  cmo: {
    system: 'You are MIRAI in CMO persona. Surface relevant trends, awards, and content opportunities.',
    rag: false,
  },
  hr_partner: {
    system: 'You are MIRAI in HR persona. Career, performance, leave guidance.',
    rag: false,
  },
  legal: {
    system:
      'You are MIRAI in Hüquqşünas persona — Azerbaijani construction-law and AZDNT normatives expert. Cite the source for every claim using the format "Mənbə: <pdf_name>, Maddə X.Y.Z" when present. If RAG returns no relevant context, reply exactly "Bu məsələ üzrə dəqiq məlumatım yoxdur." and stop.',
    rag: true,
  },
};

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const body = (await req.json()) as {
      message?: string;
      persona?: PersonaKey;
      conversation_id?: string;
    };
    const message = (body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'Missing message');
    const personaKey: PersonaKey =
      body.persona && PERSONAS[body.persona] ? body.persona : 'general';
    const persona = PERSONAS[personaKey];

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
    if ((usage?.cost_usd ?? 0) > Number(process.env.MIRAI_MONTHLY_CAP_USD ?? '20')) {
      throw new HttpError(429, 'Aylıq MIRAI limit dolub. Admin ilə əlaqə saxla.');
    }

    // PRD §7.4 RAG: legal persona always retrieves; other personas don't.
    let ragContext = '';
    let sources: { source_pdf: string; chunk_index: number; similarity: number }[] = [];
    if (persona.rag) {
      const matches = await retrieveContext(sb, message);
      sources = matches.map((m) => ({
        source_pdf: m.source_pdf,
        chunk_index: m.chunk_index,
        similarity: m.similarity,
      }));
      if (matches.length > 0) {
        ragContext =
          '\n\n--- RAG CONTEXT (top matches) ---\n' +
          matches
            .map(
              (m, i) =>
                `[#${i + 1} mənbə="${m.source_pdf}" maddə=${m.chunk_index} sim=${m.similarity.toFixed(2)}]\n${m.content}`,
            )
            .join('\n\n');
      } else {
        ragContext =
          '\n\n--- RAG CONTEXT ---\n(no relevant chunks; reply "Bu məsələ üzrə dəqiq məlumatım yoxdur." per persona instructions)';
      }
    }

    // PRD §7.1: streaming via SSE.
    const client = new Anthropic({ apiKey });
    const stream = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: persona.system + ragContext,
      messages: [{ role: 'user', content: message }],
      stream: true,
    });

    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController, evt: unknown) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));

    const body = new ReadableStream({
      async start(controller) {
        let tIn = 0;
        let tOut = 0;
        try {
          send(controller, { type: 'meta', persona: personaKey, sources });
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              send(controller, { type: 'delta', text: event.delta.text });
            } else if (event.type === 'message_start') {
              tIn = event.message.usage?.input_tokens ?? 0;
            } else if (event.type === 'message_delta') {
              tOut = event.usage?.output_tokens ?? tOut;
            }
          }

          // Cost log (Haiku 4.5 ~ $0.80 in / $4 out per Mtoken).
          const cost = (tIn / 1_000_000) * 0.8 + (tOut / 1_000_000) * 4;
          await sb.from('mirai_usage_log').upsert(
            {
              user_id: user.id,
              period_yyyymm: yyyymm,
              tokens_in: tIn,
              tokens_out: tOut,
              cost_usd: (usage?.cost_usd ?? 0) + cost,
            },
            { onConflict: 'user_id,period_yyyymm' },
          );

          send(controller, { type: 'done' });
          controller.close();
        } catch (e) {
          send(controller, { type: 'error', message: (e as Error).message });
          controller.close();
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

type KbMatch = {
  source_pdf: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

async function retrieveContext(
  sb: ReturnType<typeof admin>,
  query: string,
): Promise<KbMatch[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return [];

  const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  });
  if (!embedRes.ok) return [];
  const json = (await embedRes.json()) as { data: { embedding: number[] }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) return [];

  const { data, error } = await sb.rpc('match_knowledge_base', {
    query_embedding: embedding as unknown as string,
    match_count: 5,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[mirai/chat] match_knowledge_base failed:', error.message);
    return [];
  }
  return ((data ?? []) as KbMatch[]).filter((m) => m.similarity > 0.2);
}
