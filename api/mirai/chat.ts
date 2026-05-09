/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK.
 *
 * Implements PRD §7:
 *  - §7.1 pricing ($0.25/1M in, $1.25/1M out) and $5/user/month hard cap
 *  - §7.3 privacy filter — RLS-scoped client + role-aware guard rail
 *  - §7.4 RAG — embed query → cosine top-5 from knowledge_base → inject context
 *  - §7.5 tool layer — search_knowledge_base persona tool
 *  - §7.6 cost guardian — pre-flight refusal, 80% soft warning, creator exempt
 *  - §7.7 context engine — injects today (Asia/Baku), role, locale
 *
 * RAG embedding: PRD §3.2 specifies vector(1536); provider implied by dimension
 * is OpenAI text-embedding-ada-002 (OPENAI_API_KEY). Gracefully skips RAG
 * if key absent (TODO: PRD §7.4 should name the embedding provider explicitly).
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser, userClient } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const PRICE_IN_PER_MTOKEN = 0.25;   // PRD §7.1
const PRICE_OUT_PER_MTOKEN = 1.25;  // PRD §7.1
const MONTHLY_CAP_USD = 5;          // PRD §7.1
const SOFT_WARN_PCT = 0.8;          // PRD §7.6
const MAX_OUTPUT_TOKENS = 1024;
const RAG_TOP_K = 5;                // PRD §7.4

type PersonaKey =
  | 'general'
  | 'operations_director'
  | 'project_manager'
  | 'legal'
  | 'cmo'
  | 'finance_analyst'
  | 'strategist'
  | 'team_assistant';

const PERSONAS: Record<PersonaKey, { system: string; adminOnly?: boolean; useRag?: boolean }> = {
  // PRD §7.2 Admin personas (6)
  general: {
    system:
      'Sən MIRAI-sən — Bakıdakı Reflect arxitektura studiyasının daxili köməkçisi. Qısa cavab ver. Mənbə göstərə bilməyəndə açıq de.',
  },
  operations_director: {
    system:
      'Sən MIRAI-nin "Əməliyyat Direktoru" şəxsiyyətisən. Proses, resurs, kapasitə idarəetməsini izah et.',
    adminOnly: true,
  },
  project_manager: {
    system:
      'Sən MIRAI-nin "Layihə Mühəndisi" şəxsiyyətisən. Tapşırıq, deadline və faza koordinasiyasında kömək et.',
    adminOnly: true,
  },
  legal: {
    system:
      'Sən MIRAI-nin "Hüquqşünas" şəxsiyyətisən. Yalnız bilik bazasına (knowledge_base) əsaslan. Mənbəni həmişə göstər. Bilik bazasında olmayan suallara "Bu məsələ üzrə dəqiq məlumatım yoxdur." cavabı ver.',
    adminOnly: true,
    useRag: true,
  },
  cmo: {
    system:
      'Sən MIRAI-nin "Marketinq Direktoru (CMO)" şəxsiyyətisən. Trend, mükafat və məzmun fürsətlərini sürface elə.',
    adminOnly: true,
  },
  finance_analyst: {
    system:
      'Sən MIRAI-nin "Maliyyə Analitiki" şəxsiyyətisən. Cash flow, P&L, forecast. Fərdi maaşları əsla göstərmə.',
    adminOnly: true,
  },
  strategist: {
    system:
      'Sən MIRAI-nin "Strateq" şəxsiyyətisən. Şirkətin uzunmüddətli inkişafı, rəqabət mövqeyi haqqında kömək et.',
    adminOnly: true,
  },
  // PRD §7.2 User persona (1)
  team_assistant: {
    system: 'Sən MIRAI-nin "Komanda Köməkçisi" şəxsiyyətisən. Tapşırıqlar, məlumat axtarışı, qısa xülasə.',
  },
};

const NON_ADMIN_GUARD_RAIL = `\n\nÖZƏL QAYDA: Bu istifadəçi admin deyil. Aşağıdakılar haqqında suallara "Bu məlumat sizin üçün açıq deyil" cavabı ver:\n- Hər hansı maaş və ya əmək haqqı məbləği\n- Şirkət gəlir/xərc/forecast rəqəmləri\n- Başqa istifadəçilərin şəxsi məlumatı\n- Müştəri kontrakt məbləğləri`;

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

// --- RAG helpers (PRD §7.4) -----------------------------------------------

type KbChunk = { source_pdf: string; chunk_index: number; content: string };

async function embedQuery(text: string): Promise<number[] | null> {
  // PRD §3.2 specifies vector(1536) — dimension matches OpenAI text-embedding-ada-002.
  // Provider not named in PRD; using OPENAI_API_KEY with graceful fallback.
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-ada-002', input: text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function searchKnowledgeBase(
  sb: ReturnType<typeof import('../_lib/auth').admin>,
  embedding: number[],
): Promise<KbChunk[]> {
  // Supabase pgvector cosine similarity RPC (PRD §7.4 top-5)
  const { data } = await sb.rpc('match_knowledge_base', {
    query_embedding: embedding,
    match_count: RAG_TOP_K,
  });
  return (data ?? []) as KbChunk[];
}

type Source = { name: string; page?: number };

function buildRagContext(chunks: KbChunk[]): { context: string; sources: Source[] } {
  if (chunks.length === 0) return { context: '', sources: [] };
  const sources: Source[] = chunks.map((c) => ({ name: c.source_pdf, page: c.chunk_index }));
  const context =
    'Bilik bazasından tapılan məlumat (yalnız bu məlumata əsaslan):\n\n' +
    chunks.map((c, i) => `[${i + 1}] Mənbə: ${c.source_pdf}, Hissə ${c.chunk_index}\n${c.content}`).join('\n\n');
  return { context, sources };
}

// ---------------------------------------------------------------------------

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
    if (message.length > 4_000) throw new HttpError(400, 'Message too long (>4k chars)');

    const personaKey: PersonaKey =
      body.persona && PERSONAS[body.persona as PersonaKey] ? (body.persona as PersonaKey) : 'general';
    const persona = PERSONAS[personaKey];
    if (persona.adminOnly && !user.isAdmin) {
      throw new HttpError(403, 'Bu persona yalnız adminlər üçündür.');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();

    // --- Cost guardian (PRD §7.6) -------------------------------------------
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
        `Aylıq MIRAI limit dolub (${spent.toFixed(2)}$ / ${MONTHLY_CAP_USD}$). Növbəti ay yenilənəcək.`,
      );
    }

    const preEstimate = estimateCost(message.length / 4, 256);
    if (!user.isCreator && spent + preEstimate >= MONTHLY_CAP_USD * 1.05) {
      throw new HttpError(
        429,
        'Bu sorğu aylıq MIRAI büdcəsini aşacaq. Xahiş olunur, daha qısa sual ver.',
      );
    }

    // --- RAG (PRD §7.4) — legal persona always uses RAG; others skip --------
    let ragContext = '';
    let sources: Source[] = [];
    if (persona.useRag) {
      const embedding = await embedQuery(message);
      if (embedding) {
        const chunks = await searchKnowledgeBase(sb, embedding);
        const rag = buildRagContext(chunks);
        ragContext = rag.context;
        sources = rag.sources;
      }
    }

    // --- Context engine (PRD §7.7) ------------------------------------------
    const sbUser = userClient(user.token);
    let activeProjects = 0;
    let openTasks = 0;
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
    openTasks = tasks.count ?? 0;

    const contextPrefix = [
      `Bugün: ${bakuToday()} (Asia/Baku).`,
      `İstifadəçi rolu: ${user.isAdmin ? 'Admin' : user.roleKey ?? 'üzv'}${user.isCreator ? ' (Creator)' : ''}.`,
      user.isAdmin ? `Aktiv layihələr: ${activeProjects}.` : null,
      `Açıq tapşırıq: ${openTasks}.`,
    ]
      .filter(Boolean)
      .join(' ');

    const systemPrompt = [
      contextPrefix,
      persona.system,
      ragContext || null,
      user.isAdmin ? null : NON_ADMIN_GUARD_RAIL,
    ]
      .filter(Boolean)
      .join('\n\n');

    // --- Anthropic call -----------------------------------------------------
    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const reply =
      completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim() || 'Cavab boş gəldi.';

    // --- Cost accounting + persistence -------------------------------------
    const tIn = completion.usage?.input_tokens ?? 0;
    const tOut = completion.usage?.output_tokens ?? 0;
    const messageCost = estimateCost(tIn, tOut);
    const newSpent = spent + messageCost;

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
        .insert({ user_id: user.id, persona: personaKey, last_message_at: new Date().toISOString() })
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
          content: reply,
          tokens_in: 0,
          tokens_out: tOut,
          cost_usd: messageCost,
        },
      ]);
    }

    const usagePct = user.isCreator ? 0 : Math.min(1, newSpent / MONTHLY_CAP_USD);
    const warning = !user.isCreator && usagePct >= SOFT_WARN_PCT ? 'budget_80pct' : null;

    return jsonResponse({
      reply,
      persona: personaKey,
      conversation_id: conversationId,
      sources,
      usage: {
        spent_usd: Number(newSpent.toFixed(4)),
        cap_usd: MONTHLY_CAP_USD,
        pct: Number(usagePct.toFixed(3)),
        warning,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
