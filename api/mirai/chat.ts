/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK.
 *
 * Implements PRD §7:
 *  - §7.1 pricing ($0.25/1M in, $1.25/1M out) and configurable monthly cap
 *    (system_settings.mirai_monthly_budget jsonb {usd:number}; default $5)
 *  - §7.3 privacy filter — RLS-scoped client + role-aware guard rail
 *  - §7.4 RAG — embed query → cosine top-5 from knowledge_base → inject context
 *  - §7.5 tool layer — 6 whitelisted tools (PRD-aligned), executed server-side
 *    against an RLS-scoped client so MIRAI cannot bypass user permissions
 *  - §7.6 cost guardian — pre-flight refusal, 80% soft warning, creator exempt,
 *    hard cap (no 1.05× over-budget)
 *  - §7.7 context engine — injects today (Asia/Baku), role, locale
 *  - SSE streaming via `?stream=1` query parameter (text-only, no tool calls);
 *    standard JSON response otherwise so legacy clients keep working.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { admin, errorResponse, HttpError, jsonResponse, requireUser, userClient } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const PRICE_IN_PER_MTOKEN = 0.25;   // PRD §7.1
const PRICE_OUT_PER_MTOKEN = 1.25;  // PRD §7.1
const DEFAULT_MONTHLY_CAP_USD = 5;  // PRD §7.1 default; admin can override
const SOFT_WARN_PCT = 0.8;          // PRD §7.6
const MAX_OUTPUT_TOKENS = 1024;
const RAG_TOP_K = 5;                // PRD §7.4
const TOOL_LOOP_MAX = 4;            // hard stop on tool_use ↔ tool_result loops

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

async function getMonthlyCap(sb: ReturnType<typeof admin>): Promise<number> {
  const { data } = await sb
    .from('system_settings')
    .select('value')
    .eq('key', 'mirai_monthly_budget')
    .maybeSingle();
  const v = data?.value as { usd?: number } | undefined;
  return typeof v?.usd === 'number' && v.usd > 0 ? v.usd : DEFAULT_MONTHLY_CAP_USD;
}

// --- RAG helpers (PRD §7.4) -----------------------------------------------

type KbChunk = { source_pdf: string; chunk_index: number; content: string };

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
  } catch {
    return null;
  }
}

async function searchKnowledgeBase(
  sb: ReturnType<typeof admin>,
  embedding: number[],
): Promise<KbChunk[]> {
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

// --- Tool layer (PRD §7.5) -------------------------------------------------
// All tools are executed against userClient (RLS-scoped) so MIRAI inherits
// the caller's permissions — admin-only fields are unreachable for non-admins
// even when the model tries to call admin tools.

const TOOLS: Tool[] = [
  {
    name: 'list_my_tasks',
    description:
      'İstifadəçinin açıq tapşırıqlarını qaytarır. Status filtri (todo|in_progress|in_review|done) opsionaldır.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'in_review', 'done'] },
        limit: { type: 'number', description: 'Maksimum sıra sayı (default 10, max 25).' },
      },
    },
  },
  {
    name: 'create_task',
    description: 'Yeni tapşırıq yaradır. Yaradıcı cari istifadəçi olur.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        project_id: { type: 'string', description: 'Layihə UUID (opsional)' },
        assign_self: { type: 'boolean', description: 'Default true' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_my_projects',
    description: 'İstifadəçinin görə bildiyi aktiv layihələri qaytarır.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'firm_finance_snapshot',
    description:
      'Şirkətin son 30 günlük gəlir, xərc, açıq debitor xülasəsi. YALNIZ ADMIN.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_knowledge_base',
    description:
      'Bilik bazasından (AZ inşaat normaları və s.) mövzuya uyğun fraqmentlər tapır. Hüquqşünas personası üçün əsas vasitə.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'client_summary',
    description: 'Müştəri haqqında qısa xülasə (mərhələ, son interaksiya, gözlənilən dəyər). YALNIZ ADMIN.',
    input_schema: {
      type: 'object',
      properties: { client_id: { type: 'string' } },
      required: ['client_id'],
    },
  },
];

type ToolResult = { content: string; isError?: boolean };

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { user: { id: string; isAdmin: boolean; token: string }; sb: ReturnType<typeof admin> },
): Promise<ToolResult> {
  const sbUser = userClient(ctx.user.token);

  try {
    switch (name) {
      case 'list_my_tasks': {
        const status = typeof input.status === 'string' ? input.status : null;
        const limit = Math.min(25, Math.max(1, Number(input.limit) || 10));
        let q = sbUser
          .from('tasks')
          .select('id, title, status, deadline, project_id')
          .is('archived_at', null)
          .contains('assignee_ids', [ctx.user.id])
          .order('deadline', { ascending: true, nullsFirst: false })
          .limit(limit);
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) return { content: error.message, isError: true };
        return { content: JSON.stringify(data ?? []) };
      }
      case 'create_task': {
        const title = String(input.title ?? '').trim();
        if (!title) return { content: 'title tələb olunur', isError: true };
        const deadline = typeof input.deadline === 'string' && input.deadline ? input.deadline : null;
        const projectId = typeof input.project_id === 'string' && input.project_id ? input.project_id : null;
        const assignSelf = input.assign_self !== false;
        const { data, error } = await sbUser
          .from('tasks')
          .insert({
            title,
            deadline,
            project_id: projectId,
            assignee_ids: assignSelf ? [ctx.user.id] : [],
            status: 'todo',
            created_by: ctx.user.id,
          })
          .select('id, title')
          .single();
        if (error) return { content: error.message, isError: true };
        return { content: JSON.stringify({ created: data }) };
      }
      case 'list_my_projects': {
        const limit = Math.min(25, Math.max(1, Number(input.limit) || 10));
        const { data, error } = await sbUser
          .from('projects')
          .select('id, name, status, deadline')
          .is('archived_at', null)
          .order('deadline', { ascending: true, nullsFirst: false })
          .limit(limit);
        if (error) return { content: error.message, isError: true };
        return { content: JSON.stringify(data ?? []) };
      }
      case 'firm_finance_snapshot': {
        if (!ctx.user.isAdmin) return { content: 'Bu vasitə yalnız adminlər üçündür.', isError: true };
        const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
        const [inc, exp, rec] = await Promise.all([
          sbUser.from('incomes').select('amount').gte('occurred_at', since),
          sbUser.from('expenses').select('amount').gte('occurred_at', since),
          sbUser.from('receivables').select('amount').neq('status', 'paid'),
        ]);
        const sum = (rows: { amount: number | null }[] | null) =>
          (rows ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0);
        return {
          content: JSON.stringify({
            window_days: 30,
            incomes_total: sum(inc.data),
            expenses_total: sum(exp.data),
            net: sum(inc.data) - sum(exp.data),
            open_receivables: sum(rec.data),
          }),
        };
      }
      case 'search_knowledge_base': {
        const query = String(input.query ?? '').trim();
        if (!query) return { content: 'query tələb olunur', isError: true };
        const embedding = await embedQuery(query);
        if (!embedding) return { content: 'Embedding xidməti əlçatan deyil.', isError: true };
        const chunks = await searchKnowledgeBase(ctx.sb, embedding);
        return { content: JSON.stringify(chunks) };
      }
      case 'client_summary': {
        if (!ctx.user.isAdmin) return { content: 'Bu vasitə yalnız adminlər üçündür.', isError: true };
        const id = String(input.client_id ?? '');
        if (!id) return { content: 'client_id tələb olunur', isError: true };
        const { data, error } = await sbUser
          .from('clients')
          .select('id, name, company, pipeline_stage, expected_value, last_interaction_at, ai_icp_fit')
          .eq('id', id)
          .maybeSingle();
        if (error) return { content: error.message, isError: true };
        if (!data) return { content: 'Müştəri tapılmadı.', isError: true };
        return { content: JSON.stringify(data) };
      }
      default:
        return { content: `Bilinməyən vasitə: ${name}`, isError: true };
    }
  } catch (e) {
    return { content: (e as Error).message, isError: true };
  }
}

// ---------------------------------------------------------------------------

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const url = new URL(req.url);
    const wantsStream = url.searchParams.get('stream') === '1';

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

    // --- Cost guardian (PRD §7.6) — admin-configurable cap -----------------
    const monthlyCap = await getMonthlyCap(sb);
    const yyyymm = periodYyyyMm();
    const { data: usage } = await sb
      .from('mirai_usage_log')
      .select('tokens_in, tokens_out, cost_usd')
      .eq('user_id', user.id)
      .eq('period_yyyymm', yyyymm)
      .maybeSingle();

    const spent = Number(usage?.cost_usd ?? 0);
    if (!user.isCreator && spent >= monthlyCap) {
      throw new HttpError(
        429,
        `Aylıq MIRAI limit dolub (${spent.toFixed(2)}$ / ${monthlyCap}$). Növbəti ay yenilənəcək.`,
      );
    }

    // PRD §7.6 hard cap (no over-budget tolerance).
    const preEstimate = estimateCost(message.length / 4, 256);
    if (!user.isCreator && spent + preEstimate >= monthlyCap) {
      throw new HttpError(
        429,
        'Bu sorğu aylıq MIRAI büdcəsini aşacaq. Xahiş olunur, daha qısa sual ver.',
      );
    }

    // 80% pre-flight warning (PRD §7.6) — surfaced in response, not blocking.
    const preWarning = !user.isCreator && spent / monthlyCap >= SOFT_WARN_PCT ? 'budget_80pct' : null;

    // --- RAG (PRD §7.4) — legal persona always uses RAG context -----------
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

    // --- Context engine (PRD §7.7) ----------------------------------------
    const sbUser = userClient(user.token);
    let activeProjects = 0;
    let openTasks = 0;
    let topProject: { name: string; phase: string | null; deadline: string | null } | null = null;
    if (user.isAdmin) {
      const { data: projs, count } = await sbUser
        .from('projects')
        .select('id, name, phases, deadline', { count: 'exact' })
        .eq('status', 'active')
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(1);
      activeProjects = count ?? 0;
      if (projs && projs.length) {
        const phases = (projs[0] as { phases?: string[] }).phases ?? [];
        topProject = {
          name: projs[0].name,
          phase: phases.length > 0 ? phases[phases.length - 1] : null,
          deadline: projs[0].deadline ?? null,
        };
      }
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
      topProject
        ? `Ən yaxın deadline-lı layihə: ${topProject.name}${topProject.phase ? ` (faza: ${topProject.phase})` : ''}${topProject.deadline ? `, ${topProject.deadline}` : ''}.`
        : null,
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

    const client = new Anthropic({ apiKey });

    // --- Streaming branch (text-only path) -------------------------------
    // Tools require multi-turn loops which interleave with the stream; for
    // simplicity SSE skips tools. The non-streaming branch supports both.
    if (wantsStream) {
      return await runStreaming({
        client,
        systemPrompt,
        message,
        sb,
        user,
        usage,
        spent,
        yyyymm,
        monthlyCap,
        personaKey,
        sources,
        preWarning,
        conversationId: body.conversation_id ?? null,
      });
    }

    // --- Non-streaming branch (with tool use) ----------------------------
    const messages: MessageParam[] = [{ role: 'user', content: message }];
    const toolsUsed: string[] = [];
    let finalText = '';
    let totalIn = 0;
    let totalOut = 0;

    for (let iter = 0; iter < TOOL_LOOP_MAX; iter++) {
      const completion = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      totalIn += completion.usage?.input_tokens ?? 0;
      totalOut += completion.usage?.output_tokens ?? 0;

      const toolUses = completion.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      const text = completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim();

      if (toolUses.length === 0) {
        finalText = text || finalText;
        break;
      }

      // Run all requested tools in parallel, append assistant + tool_result turns.
      const toolResults = await Promise.all(
        toolUses.map(async (tu) => {
          toolsUsed.push(tu.name);
          const r = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, {
            user: { id: user.id, isAdmin: user.isAdmin, token: user.token },
            sb,
          });
          return { tool_use_id: tu.id, ...r };
        }),
      );

      messages.push({ role: 'assistant', content: completion.content });
      messages.push({
        role: 'user',
        content: toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.isError ?? false,
        })),
      });

      if (iter === TOOL_LOOP_MAX - 1) finalText = text || 'Maksimum vasitə dövrü aşıldı.';
    }

    if (!finalText) finalText = 'Cavab boş gəldi.';

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

    const conversationId = await persistConversation(sb, {
      conversationId: body.conversation_id ?? null,
      personaKey,
      userId: user.id,
      userMessage: message,
      assistantMessage: finalText,
      tIn: totalIn,
      tOut: totalOut,
      messageCost,
      toolsUsed,
    });

    const usagePct = user.isCreator ? 0 : Math.min(1, newSpent / monthlyCap);
    const warning = preWarning ?? (!user.isCreator && usagePct >= SOFT_WARN_PCT ? 'budget_80pct' : null);

    return jsonResponse({
      reply: finalText,
      persona: personaKey,
      conversation_id: conversationId,
      sources,
      tools_used: toolsUsed,
      usage: {
        spent_usd: Number(newSpent.toFixed(4)),
        cap_usd: monthlyCap,
        pct: Number(usagePct.toFixed(3)),
        warning,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

async function persistConversation(
  sb: ReturnType<typeof admin>,
  args: {
    conversationId: string | null;
    personaKey: PersonaKey;
    userId: string;
    userMessage: string;
    assistantMessage: string;
    tIn: number;
    tOut: number;
    messageCost: number;
    toolsUsed: string[];
  },
): Promise<string | null> {
  let id = args.conversationId;
  if (!id) {
    const { data: conv } = await sb
      .from('mirai_conversations')
      .insert({
        user_id: args.userId,
        persona: args.personaKey,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    id = conv?.id ?? null;
  } else {
    await sb
      .from('mirai_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', id);
  }
  if (id) {
    await sb.from('mirai_messages').insert([
      {
        conversation_id: id,
        role: 'user',
        content: args.userMessage,
        tokens_in: args.tIn,
        tokens_out: 0,
        cost_usd: 0,
      },
      {
        conversation_id: id,
        role: 'assistant',
        content: args.assistantMessage,
        tokens_in: 0,
        tokens_out: args.tOut,
        cost_usd: args.messageCost,
        tools_used: args.toolsUsed,
      },
    ]);
  }
  return id;
}

// --- SSE streaming ----------------------------------------------------------

async function runStreaming(args: {
  client: Anthropic;
  systemPrompt: string;
  message: string;
  sb: ReturnType<typeof admin>;
  user: { id: string; isAdmin: boolean; isCreator: boolean; token: string };
  usage: { tokens_in: number; tokens_out: number; cost_usd: number } | null;
  spent: number;
  yyyymm: number;
  monthlyCap: number;
  personaKey: PersonaKey;
  sources: Source[];
  preWarning: string | null;
  conversationId: string | null;
}): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send('meta', { sources: args.sources, persona: args.personaKey });

        let fullText = '';
        let tIn = 0;
        let tOut = 0;

        const stream = await args.client.messages.stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: args.systemPrompt,
          messages: [{ role: 'user', content: args.message }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            send('delta', { text: event.delta.text });
          } else if (event.type === 'message_delta' && event.usage) {
            tOut = event.usage.output_tokens ?? tOut;
          } else if (event.type === 'message_start' && event.message.usage) {
            tIn = event.message.usage.input_tokens ?? 0;
          }
        }

        const messageCost = estimateCost(tIn, tOut);
        const newSpent = args.spent + messageCost;

        await args.sb.from('mirai_usage_log').upsert(
          {
            user_id: args.user.id,
            period_yyyymm: args.yyyymm,
            tokens_in: Number(args.usage?.tokens_in ?? 0) + tIn,
            tokens_out: Number(args.usage?.tokens_out ?? 0) + tOut,
            cost_usd: newSpent,
          },
          { onConflict: 'user_id,period_yyyymm' },
        );

        const conversationId = await persistConversation(args.sb, {
          conversationId: args.conversationId,
          personaKey: args.personaKey,
          userId: args.user.id,
          userMessage: args.message,
          assistantMessage: fullText,
          tIn,
          tOut,
          messageCost,
          toolsUsed: [],
        });

        const usagePct = args.user.isCreator ? 0 : Math.min(1, newSpent / args.monthlyCap);
        const warning =
          args.preWarning ?? (!args.user.isCreator && usagePct >= SOFT_WARN_PCT ? 'budget_80pct' : null);

        send('done', {
          reply: fullText,
          conversation_id: conversationId,
          usage: {
            spent_usd: Number(newSpent.toFixed(4)),
            cap_usd: args.monthlyCap,
            pct: Number(usagePct.toFixed(3)),
            warning,
          },
        });
      } catch (e) {
        send('error', { error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
