/**
 * MIRAI streaming chat (PRD §3.1, §7.1).
 *
 * Streams Claude Haiku output via SSE-style frames so the page can render
 * tokens as they arrive. Mirrors the same guard rails as the synchronous
 * /api/mirai/chat:
 *   - Bearer auth + user-scoped supabase client
 *   - Rate limit (admin/user tier)
 *   - Cost guardian: hard cap, pre-flight refusal, soft warning
 *   - Privacy filter: non-admin guard rail prepended to system prompt
 *   - Context engine: Asia/Baku today, role, active projects/open tasks
 *   - RAG: search_knowledge_base for normative-pattern queries
 *
 * Frame format (newline-delimited JSON, not eventsource — easier to consume
 * with fetch + ReadableStream on the client and avoids EventSource's
 * inability to send Authorization headers):
 *   {"type":"delta","text":"..."}
 *   {"type":"sources","items":[{name,page}]}
 *   {"type":"done","usage":{...}}
 *   {"type":"error","message":"..."}
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  admin,
  errorResponse,
  HttpError,
  jsonResponse,
  requireUser,
  userClient,
} from '../_lib/auth';
import { rateLimit, rateLimitHeaders } from '../_lib/rate-limit';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const PRICE_IN_PER_MTOKEN = 0.25;
const PRICE_OUT_PER_MTOKEN = 1.25;
const MONTHLY_CAP_USD = 5;
const SOFT_WARN_PCT = 0.8;
const MAX_OUTPUT_TOKENS = 1024;

type PersonaKey = 'general' | 'project_manager' | 'finance_analyst' | 'cmo' | 'hr_partner';

const PERSONAS: Record<PersonaKey, { system: string; adminOnly?: boolean }> = {
  general: {
    system:
      'Sən MIRAI-sən — Bakıdakı Reflect arxitektura studiyasının daxili köməkçisi. Qısa cavab ver. Mənbə göstərə bilməyəndə açıq de.',
  },
  project_manager: {
    system:
      'Sən MIRAI-nin "Layihə Mühəndisi" şəxsiyyətisən. Tapşırıq, deadline və faza koordinasiyasında kömək et.',
  },
  finance_analyst: {
    system:
      'Sən MIRAI-nin "Maliyyə Analitiki" şəxsiyyətisən. Cash flow, P&L, forecast. Fərdi maaşları əsla göstərmə.',
    adminOnly: true,
  },
  cmo: {
    system: 'Sən MIRAI-nin CMO şəxsiyyətisən. Trend, mükafat və məzmun fürsətlərini sürface elə.',
    adminOnly: true,
  },
  hr_partner: {
    system: 'Sən MIRAI-nin HR şəxsiyyətisən. Karyera, performans, məzuniyyət.',
    adminOnly: true,
  },
};

const NON_ADMIN_GUARD_RAIL = `\n\nÖZƏL QAYDA: Bu istifadəçi admin deyil. Aşağıdakılar haqqında suallara "Bu məlumat sizin üçün açıq deyil" cavabı ver:\n- Hər hansı maaş və ya əmək haqqı məbləği\n- Şirkət gəlir/xərc/forecast rəqəmləri\n- Başqa istifadəçilərin şəxsi məlumatı\n- Müştəri kontrakt məbləğləri`;
const KB_GUIDANCE = `\n\nRAG QAYDASI: Bilik bazasından gələn parçalar əsasında cavab ver və hər iddiadan sonra mənbəni göstər (Mənbə: <pdf_name>, chunk:<index>). Heç bir parça yoxdursa "Bu məsələ üzrə dəqiq məlumatım yoxdur." de.`;

const EMBED_DIM = 1536;
function placeholderEmbed(text: string): number[] {
  const v = new Float32Array(EMBED_DIM);
  const lower = text.toLowerCase().normalize('NFKD');
  for (let i = 0; i + 4 <= lower.length; i++) {
    const gram = lower.slice(i, i + 4);
    let h = 2166136261;
    for (let j = 0; j < gram.length; j++) {
      h ^= gram.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    v[idx] += 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

const KB_TRIGGER_RE = /(qanun|maddə|normativ|azdnt|şəhərsalma|tikinti norma|təlim)/i;

function bakuToday(): string {
  return new Intl.DateTimeFormat('az-AZ', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}
function periodYyyyMm(): number {
  const d = new Date();
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}
function estimateCost(inTokens: number, outTokens: number): number {
  return (inTokens / 1_000_000) * PRICE_IN_PER_MTOKEN + (outTokens / 1_000_000) * PRICE_OUT_PER_MTOKEN;
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);

    const rl = await rateLimit({ tier: user.isAdmin ? 'admin' : 'user', identifier: user.id });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Çox tez göndərilir — bir az gözlə.' }),
        {
          status: 429,
          headers: { 'content-type': 'application/json', ...rateLimitHeaders(rl) },
        },
      );
    }

    const body = (await req.json()) as {
      message?: string;
      persona?: PersonaKey;
      conversation_id?: string;
    };
    const message = (body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'Missing message');
    if (message.length > 4_000) throw new HttpError(400, 'Message too long (>4k chars)');

    const personaKey: PersonaKey =
      body.persona && PERSONAS[body.persona] ? body.persona : 'general';
    const persona = PERSONAS[personaKey];
    if (persona.adminOnly && !user.isAdmin) {
      throw new HttpError(403, 'Bu persona yalnız adminlər üçündür.');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();
    const yyyymm = periodYyyyMm();
    const { data: usage } = await sb
      .from('mirai_usage_log')
      .select('tokens_in, tokens_out, cost_usd')
      .eq('user_id', user.id)
      .eq('period_yyyymm', yyyymm)
      .maybeSingle();
    const spent = Number(usage?.cost_usd ?? 0);
    if (!user.isCreator && spent >= MONTHLY_CAP_USD) {
      throw new HttpError(
        429,
        `Aylıq MIRAI limit dolub (${spent.toFixed(2)}$ / ${MONTHLY_CAP_USD}$).`,
      );
    }
    const preEstimate = estimateCost(message.length / 4, 256);
    if (!user.isCreator && spent + preEstimate >= MONTHLY_CAP_USD * 1.05) {
      throw new HttpError(429, 'Bu sorğu aylıq MIRAI büdcəsini aşacaq.');
    }

    // Context + RAG
    const sbUser = userClient(user.token);
    let activeProjects = 0;
    if (user.isAdmin) {
      const proj = await sbUser
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      activeProjects = proj.count ?? 0;
    }
    const taskQ = sbUser
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null);
    if (!user.isAdmin) taskQ.contains('assignee_ids', [user.id]);
    const tasks = await taskQ;
    const openTasks = tasks.count ?? 0;

    let ragSnippets: Array<{ source: string; chunk: number; text: string }> = [];
    if (user.isAdmin && KB_TRIGGER_RE.test(message)) {
      const embedding = placeholderEmbed(message);
      const { data: hits } = await sb.rpc('search_knowledge_base', {
        p_embedding: embedding,
        p_limit: 5,
      });
      if (Array.isArray(hits)) {
        ragSnippets = (
          hits as Array<{
            source_pdf: string;
            chunk_index: number;
            content: string;
          }>
        ).map((h) => ({ source: h.source_pdf, chunk: h.chunk_index, text: h.content }));
      }
    }
    const ragBlock =
      ragSnippets.length > 0
        ? '\n\nBİLİK BAZASI PARÇALARI:\n' +
          ragSnippets
            .map(
              (s, i) =>
                `[#${i + 1}] Mənbə: ${s.source}, chunk:${s.chunk}\n${s.text.slice(0, 1200)}`,
            )
            .join('\n\n')
        : '';
    const contextPrefix = [
      `Bugün: ${bakuToday()} (Asia/Baku).`,
      `İstifadəçi rolu: ${user.isAdmin ? 'Admin' : user.roleKey ?? 'üzv'}${user.isCreator ? ' (Creator)' : ''}.`,
      user.isAdmin ? `Aktiv layihələr: ${activeProjects}.` : null,
      `Açıq tapşırıq: ${openTasks}.`,
    ]
      .filter(Boolean)
      .join(' ');
    const systemPrompt =
      contextPrefix +
      '\n\n' +
      persona.system +
      (user.isAdmin ? '' : NON_ADMIN_GUARD_RAIL) +
      (ragSnippets.length > 0 ? KB_GUIDANCE : '') +
      ragBlock;

    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function send(obj: Record<string, unknown>) {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        }
        try {
          if (ragSnippets.length > 0) {
            send({
              type: 'sources',
              items: ragSnippets.map((s) => ({ name: s.source, page: s.chunk })),
            });
          }

          let collected = '';
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta' &&
              typeof event.delta.text === 'string'
            ) {
              collected += event.delta.text;
              send({ type: 'delta', text: event.delta.text });
            }
          }
          const final = await stream.finalMessage();
          const tIn = final.usage?.input_tokens ?? 0;
          const tOut = final.usage?.output_tokens ?? 0;
          const messageCost = estimateCost(tIn, tOut);
          const newSpent = spent + messageCost;

          // Persist usage + conversation rows (best-effort)
          await sb.from('mirai_usage_log').upsert(
            {
              user_id: user.id,
              period_yyyymm: yyyymm,
              tokens_in: Number(usage?.tokens_in ?? 0) + tIn,
              tokens_out: Number(usage?.tokens_out ?? 0) + tOut,
              cost_usd: newSpent,
            },
            { onConflict: 'user_id,period_yyyymm' },
          );
          let conversationId = body.conversation_id ?? null;
          if (!conversationId) {
            const { data: conv } = await sb
              .from('mirai_conversations')
              .insert({
                user_id: user.id,
                persona: personaKey,
                last_message_at: new Date().toISOString(),
              })
              .select('id')
              .single();
            conversationId = conv?.id ?? null;
          } else {
            await sb
              .from('mirai_conversations')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', conversationId);
          }
          if (conversationId) {
            await sb.from('mirai_messages').insert([
              {
                conversation_id: conversationId,
                role: 'user',
                content: message,
                tokens_in: tIn,
                tokens_out: 0,
                cost_usd: 0,
              },
              {
                conversation_id: conversationId,
                role: 'assistant',
                content: collected,
                tokens_in: 0,
                tokens_out: tOut,
                cost_usd: messageCost,
              },
            ]);
          }

          const usagePct = user.isCreator ? 0 : Math.min(1, newSpent / MONTHLY_CAP_USD);
          send({
            type: 'done',
            conversation_id: conversationId,
            usage: {
              spent_usd: Number(newSpent.toFixed(4)),
              cap_usd: MONTHLY_CAP_USD,
              pct: Number(usagePct.toFixed(3)),
              warning:
                !user.isCreator && usagePct >= SOFT_WARN_PCT ? 'budget_80pct' : null,
            },
          });
          controller.close();
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'stream error' });
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    });
  } catch (e) {
    if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status);
    return errorResponse(e);
  }
}
