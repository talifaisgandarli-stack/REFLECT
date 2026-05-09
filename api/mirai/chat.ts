/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK.
 *
 * Implements PRD §7:
 *  - §7.1 pricing ($0.25/1M in, $1.25/1M out) and $5/user/month hard cap
 *  - §7.3 privacy filter — RLS-scoped client + role-aware guard rail
 *  - §7.4 RAG — embed query → cosine top-5 from knowledge_base → inject context
 *  - §7.5 tool layer — 6 whitelisted server-executed tools via Anthropic tool_use
 *  - §7.6 cost guardian — pre-flight refusal, 80% soft warning, creator exempt
 *  - §7.7 context engine — injects today (Asia/Baku), role, active projects, open tasks
 *
 * RAG embedding: PRD §3.2 specifies vector(1536); provider implied by dimension
 * is OpenAI text-embedding-ada-002 (OPENAI_API_KEY). Gracefully skips RAG
 * if key absent (TODO: PRD §7.4 should name the embedding provider explicitly).
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser, rateLimit, userClient } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const PRICE_IN_PER_MTOKEN = 0.25;
const PRICE_OUT_PER_MTOKEN = 1.25;
const MONTHLY_CAP_USD = 5;
const SOFT_WARN_PCT = 0.8;
const MAX_OUTPUT_TOKENS = 1024;
const RAG_TOP_K = 5;
const TOOL_LOOP_MAX = 5; // safety: max agentic loop iterations

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
  general: {
    system: 'Sən MIRAI-sən — Bakıdakı Reflect arxitektura studiyasının daxili köməkçisi. Qısa cavab ver.',
  },
  operations_director: {
    system: 'Sən MIRAI-nin "Əməliyyat Direktoru" şəxsiyyətisən. Proses, resurs, kapasitə idarəetməsini izah et.',
    adminOnly: true,
  },
  project_manager: {
    system: 'Sən MIRAI-nin "Layihə Mühəndisi" şəxsiyyətisən. Tapşırıq, deadline və faza koordinasiyasında kömək et.',
    adminOnly: true,
  },
  legal: {
    system:
      'Sən MIRAI-nin "Hüquqşünas" şəxsiyyətisən. Yalnız bilik bazasına əsaslan. Mənbəni həmişə göstər. Bilik bazasında olmayan suallara "Bu məsələ üzrə dəqiq məlumatım yoxdur." cavabı ver.',
    adminOnly: true,
    useRag: true,
  },
  cmo: {
    system: 'Sən MIRAI-nin "Marketinq Direktoru (CMO)" şəxsiyyətisən. Trend, mükafat və məzmun fürsətlərini sürface elə.',
    adminOnly: true,
  },
  finance_analyst: {
    system: 'Sən MIRAI-nin "Maliyyə Analitiki" şəxsiyyətisən. Cash flow, P&L, forecast. Fərdi maaşları əsla göstərmə.',
    adminOnly: true,
  },
  strategist: {
    system: 'Sən MIRAI-nin "Strateq" şəxsiyyətisən. Şirkətin uzunmüddətli inkişafı, rəqabət mövqeyi haqqında kömək et.',
    adminOnly: true,
  },
  team_assistant: {
    system: 'Sən MIRAI-nin "Komanda Köməkçisi" şəxsiyyətisən. Tapşırıqlar, məlumat axtarışı, qısa xülasə.',
  },
};

const NON_ADMIN_GUARD = `\n\nÖZƏL QAYDA: Bu istifadəçi admin deyil. Aşağıdakılar haqqında suallara "Bu məlumat sizin üçün açıq deyil" cavabı ver:\n- Maaş/əmək haqqı məbləği\n- Şirkət gəlir/xərc/forecast rəqəmləri\n- Başqa istifadəçilərin şəxsi məlumatı\n- Müştəri kontrakt məbləğləri`;

// ── Tool definitions (PRD §7.5) ─────────────────────────────────────────────

const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: 'list_my_tasks',
    description: 'İstifadəçinin açıq tapşırıqlarını qaytarır.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'list_my_projects',
    description: 'Aktiv layihələri qaytarır (admin: hamısı; user: iştirak etdiyi).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_task',
    description: 'Cari istifadəçi adından yeni tapşırıq yaradır.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Tapşırığın başlığı' },
        deadline: { type: 'string', description: 'YYYY-MM-DD formatında deadline (isteğe bağlı)' },
        project_id: { type: 'string', description: 'Layihə ID (isteğe bağlı)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'summarize_project',
    description: 'Layihə haqqında xülasə — ad, faza, deadline, açıq tapşırıq sayı.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Layihə ID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'firm_finance_snapshot',
    description: 'Cari ay üçün şirkət maliyyə icmalı — yalnız adminlər üçün.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'post_announcement_draft',
    description: 'Elanlar modulu üçün təsdiqlənməmiş elan yaradır — yalnız adminlər üçün.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        body:  { type: 'string' },
        category: { type: 'string' },
      },
      required: ['title', 'body'],
    },
  },
];

// ── Tool executor (PRD §7.3 — all queries via user-scoped RLS client) ────────

type ToolInput = Record<string, unknown>;

async function executeTool(
  name: string,
  input: ToolInput,
  user: Awaited<ReturnType<typeof requireUser>>,
  sb: ReturnType<typeof admin>,
  sbUser: ReturnType<typeof import('../_lib/auth').userClient>,
): Promise<string> {
  switch (name) {
    case 'list_my_tasks': {
      const q = sbUser.from('tasks').select('id, title, status, deadline, project_id').is('archived_at', null);
      if (!user.isAdmin) q.contains('assignee_ids', [user.id]);
      const { data } = await q.order('deadline', { ascending: true }).limit(20);
      return JSON.stringify(data ?? []);
    }
    case 'list_my_projects': {
      const q = sbUser.from('projects').select('id, name, status, phases, deadline').is('archived_at', null);
      if (!user.isAdmin) {
        // Only projects the user has tasks on
        const { data: taskRows } = await sbUser
          .from('tasks')
          .select('project_id')
          .contains('assignee_ids', [user.id])
          .not('project_id', 'is', null);
        const ids = Array.from(new Set((taskRows ?? []).map((t) => t.project_id).filter(Boolean)));
        if (ids.length === 0) return JSON.stringify([]);
        q.in('id', ids);
      }
      const { data } = await q.limit(20);
      return JSON.stringify(data ?? []);
    }
    case 'create_task': {
      const title = String(input.title ?? '').slice(0, 300);
      if (!title) return JSON.stringify({ error: 'title is required' });
      const { data, error } = await sbUser.from('tasks').insert({
        title,
        assignee_ids: [user.id],
        deadline: input.deadline ? String(input.deadline) : null,
        project_id: input.project_id ? String(input.project_id) : null,
        status: 'queued',
      }).select('id, title, status').single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(data);
    }
    case 'summarize_project': {
      const pid = String(input.project_id ?? '');
      const { data: proj } = await sbUser.from('projects').select('id, name, status, phases, deadline').eq('id', pid).maybeSingle();
      if (!proj) return JSON.stringify({ error: 'Layihə tapılmadı və ya icazəniz yoxdur' });
      const { count } = await sbUser.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', pid).is('archived_at', null);
      return JSON.stringify({ ...proj, open_task_count: count ?? 0 });
    }
    case 'firm_finance_snapshot': {
      if (!user.isAdmin) return JSON.stringify({ error: 'Yalnız adminlər üçündür' });
      const now = new Date();
      const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
      const [inc, exp] = await Promise.all([
        sb.from('incomes').select('amount').gte('occurred_at', monthStart),
        sb.from('expenses').select('amount').gte('occurred_at', monthStart),
      ]);
      const totalIn = (inc.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const totalOut = (exp.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      return JSON.stringify({ month: monthStart.slice(0, 7), total_income: totalIn, total_expense: totalOut, balance: totalIn - totalOut });
    }
    case 'post_announcement_draft': {
      if (!user.isAdmin) return JSON.stringify({ error: 'Yalnız adminlər üçündür' });
      const { data, error } = await sb.from('announcements').insert({
        title: String(input.title ?? '').slice(0, 200),
        body: String(input.body ?? ''),
        category: input.category ? String(input.category) : null,
        mirai_generated: true,
        approved: false,
        created_by: user.id,
      }).select('id').single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ ok: true, announcement_id: data.id, note: 'Admin təsdiqi gözlənir' });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function bakuToday(): string {
  return new Intl.DateTimeFormat('az-AZ', {
    timeZone: 'Asia/Baku', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date());
}

function periodYyyyMm(): number {
  const d = new Date();
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

function estimateCost(inT: number, outT: number): number {
  return (inT / 1_000_000) * PRICE_IN_PER_MTOKEN + (outT / 1_000_000) * PRICE_OUT_PER_MTOKEN;
}

// ── RAG ──────────────────────────────────────────────────────────────────────

type KbChunk = { source_pdf: string; chunk_index: number; content: string };
type Source = { name: string; page?: number };

async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-ada-002', input: text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? null;
  } catch { return null; }
}

async function searchKb(sb: ReturnType<typeof admin>, embedding: number[]): Promise<KbChunk[]> {
  const { data } = await sb.rpc('match_knowledge_base', { query_embedding: embedding, match_count: RAG_TOP_K });
  return (data ?? []) as KbChunk[];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    await rateLimit(user, user.id);
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
    if (persona.adminOnly && !user.isAdmin) throw new HttpError(403, 'Bu persona yalnız adminlər üçündür.');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();

    // ── Cost guardian (PRD §7.6) ─────────────────────────────────────────────
    const yyyymm = periodYyyyMm();
    const { data: usage } = await sb
      .from('mirai_usage_log').select('tokens_in, tokens_out, cost_usd')
      .eq('user_id', user.id).eq('period_yyyymm', yyyymm).maybeSingle();
    const spent = Number(usage?.cost_usd ?? 0);
    if (!user.isCreator && spent >= MONTHLY_CAP_USD) {
      throw new HttpError(429, `Aylıq MIRAI limit dolub (${spent.toFixed(2)}$ / ${MONTHLY_CAP_USD}$). Növbəti ay yenilənəcək.`);
    }
    const preEstimate = estimateCost(message.length / 4, 256);
    if (!user.isCreator && spent + preEstimate >= MONTHLY_CAP_USD * 1.05) {
      throw new HttpError(429, 'Bu sorğu aylıq MIRAI büdcəsini aşacaq. Xahiş olunur, daha qısa sual ver.');
    }

    // ── RAG for legal persona (PRD §7.4) ─────────────────────────────────────
    let ragContext = '';
    let sources: Source[] = [];
    if (persona.useRag) {
      const embedding = await embedQuery(message);
      if (embedding) {
        const chunks = await searchKb(sb, embedding);
        if (chunks.length > 0) {
          sources = chunks.map((c) => ({ name: c.source_pdf, page: c.chunk_index }));
          ragContext =
            'Bilik bazasından tapılan məlumat (yalnız bu məlumata əsaslan):\n\n' +
            chunks.map((c, i) => `[${i + 1}] Mənbə: ${c.source_pdf}, Hissə ${c.chunk_index}\n${c.content}`).join('\n\n');
        }
      }
    }

    // ── Context engine (PRD §7.7) ─────────────────────────────────────────────
    const sbUser = userClient(user.token);
    let activeProjects = 0;
    if (user.isAdmin) {
      const { count } = await sbUser.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active');
      activeProjects = count ?? 0;
    }
    const taskQ = sbUser.from('tasks').select('id', { count: 'exact', head: true }).is('archived_at', null);
    if (!user.isAdmin) taskQ.contains('assignee_ids', [user.id]);
    const { count: openTasks } = await taskQ;

    const contextPrefix = [
      `Bugün: ${bakuToday()} (Asia/Baku).`,
      `İstifadəçi rolu: ${user.isAdmin ? 'Admin' : user.roleKey ?? 'üzv'}${user.isCreator ? ' (Creator)' : ''}.`,
      user.isAdmin ? `Aktiv layihələr: ${activeProjects}.` : null,
      `Açıq tapşırıq: ${openTasks ?? 0}.`,
    ].filter(Boolean).join(' ');

    const systemPrompt = [contextPrefix, persona.system, ragContext || null, user.isAdmin ? null : NON_ADMIN_GUARD]
      .filter(Boolean).join('\n\n');

    // ── Agentic tool loop (PRD §7.5) ─────────────────────────────────────────
    const client = new Anthropic({ apiKey });
    let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }];
    let totalIn = 0;
    let totalOut = 0;
    let reply = '';
    const toolsUsed: string[] = [];

    for (let i = 0; i < TOOL_LOOP_MAX; i++) {
      const completion = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        tools: TOOL_DEFS,
        messages,
      });
      totalIn += completion.usage?.input_tokens ?? 0;
      totalOut += completion.usage?.output_tokens ?? 0;

      if (completion.stop_reason === 'end_turn' || !completion.content.some((b) => b.type === 'tool_use')) {
        reply = completion.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as Anthropic.TextBlock).text)
          .join('\n')
          .trim() || 'Cavab boş gəldi.';
        break;
      }

      // Process tool calls
      const assistantContent: Anthropic.MessageParam['content'] = completion.content;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of completion.content) {
        if (block.type !== 'tool_use') continue;
        toolsUsed.push(block.name);
        const result = await executeTool(block.name, block.input as ToolInput, user, sb, sbUser);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      messages = [
        ...messages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: toolResults },
      ];
    }

    if (!reply) reply = 'Cavab tamamlanmadı.';

    // ── Cost accounting ──────────────────────────────────────────────────────
    const messageCost = estimateCost(totalIn, totalOut);
    const newSpent = spent + messageCost;
    await sb.from('mirai_usage_log').upsert(
      {
        user_id: user.id,
        period_yyyymm: yyyymm,
        tokens_in: Number(usage?.tokens_in ?? 0) + totalIn,
        tokens_out: Number(usage?.tokens_out ?? 0) + totalOut,
        cost_usd: newSpent,
      },
      { onConflict: 'user_id,period_yyyymm' },
    );

    // ── Conversation persistence ──────────────────────────────────────────────
    let conversationId = body.conversation_id ?? null;
    if (!conversationId) {
      const { data: conv } = await sb.from('mirai_conversations')
        .insert({ user_id: user.id, persona: personaKey, last_message_at: new Date().toISOString() })
        .select('id').single();
      conversationId = conv?.id ?? null;
    } else {
      await sb.from('mirai_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    }
    let lastMessageId: string | null = null;
    if (conversationId) {
      const { data: msgs } = await sb.from('mirai_messages').insert([
        { conversation_id: conversationId, role: 'user', content: message, tokens_in: totalIn, tokens_out: 0, cost_usd: 0, tools_used: [] },
        { conversation_id: conversationId, role: 'assistant', content: reply, tokens_in: 0, tokens_out: totalOut, cost_usd: messageCost, tools_used: toolsUsed },
      ]).select('id');
      lastMessageId = (msgs ?? [])[1]?.id ?? null;
    }

    const usagePct = user.isCreator ? 0 : Math.min(1, newSpent / MONTHLY_CAP_USD);
    const warning = !user.isCreator && usagePct >= SOFT_WARN_PCT ? 'budget_80pct' : null;

    return jsonResponse({
      reply,
      persona: personaKey,
      conversation_id: conversationId,
      message_id: lastMessageId,
      sources,
      tools_used: toolsUsed,
      usage: { spent_usd: Number(newSpent.toFixed(4)), cap_usd: MONTHLY_CAP_USD, pct: Number(usagePct.toFixed(3)), warning },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
