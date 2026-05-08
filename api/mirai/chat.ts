/**
 * MIRAI chat — Claude Haiku 4.5 via Anthropic SDK.
 *
 * Implements PRD §7:
 *  - §7.1 pricing ($0.25/1M in, $1.25/1M out) and $5/user/month hard cap
 *  - §7.3 privacy filter — RLS-scoped client + role-aware guard rail
 *  - §7.6 cost guardian — pre-flight refusal, 80% soft warning, creator exempt
 *  - §7.7 context engine — injects today (Asia/Baku), role, locale
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser, userClient } from '../_lib/auth';
import { rateLimit, rateLimitHeaders } from '../_lib/rate-limit';
import { clientIp, logAudit } from '../_lib/audit';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const PRICE_IN_PER_MTOKEN = 0.25;   // PRD §7.1
const PRICE_OUT_PER_MTOKEN = 1.25;  // PRD §7.1
const MONTHLY_CAP_USD = 5;          // PRD §7.1
const SOFT_WARN_PCT = 0.8;          // PRD §7.6
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
    system:
      'Sən MIRAI-nin CMO şəxsiyyətisən. Trend, mükafat və məzmun fürsətlərini sürface elə.',
    adminOnly: true,
  },
  hr_partner: {
    system: 'Sən MIRAI-nin HR şəxsiyyətisən. Karyera, performans, məzuniyyət.',
    adminOnly: true,
  },
};

const NON_ADMIN_GUARD_RAIL = `\n\nÖZƏL QAYDA: Bu istifadəçi admin deyil. Aşağıdakılar haqqında suallara "Bu məlumat sizin üçün açıq deyil" cavabı ver:\n- Hər hansı maaş və ya əmək haqqı məbləği\n- Şirkət gəlir/xərc/forecast rəqəmləri\n- Başqa istifadəçilərin şəxsi məlumatı\n- Müştəri kontrakt məbləğləri`;

const KB_GUIDANCE = `\n\nRAG QAYDASI: Hüquqi və ya texniki normativlərə dair sual gələrsə, əvvəlcə bilik bazasını axtar. Cavabını yalnız tapılan parçalara əsaslandır və hər iddiadan sonra mənbəni göstər (Mənbə: <pdf_name>, chunk:<index>). Heç bir parça tapılmasa "Bu məsələ üzrə dəqiq məlumatım yoxdur." de.`;

const EMBED_DIM = 1536;
function placeholderEmbed(text: string): number[] {
  // Mirror of api/knowledge/ingest.ts so query-side and ingest-side
  // embeddings live in the same vector space.
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

const KB_TRIGGER_RE =
  /(qanun|maddə|normativ|azdnt|şəhərsalma|tikinti norma|təlim)/i;

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

    const rl = await rateLimit({
      tier: user.isAdmin ? 'admin' : 'user',
      identifier: user.id,
    });
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

    const personaKey: PersonaKey = body.persona && PERSONAS[body.persona] ? body.persona : 'general';
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
      await logAudit({
        actorId: user.id,
        action: 'mirai_chat_blocked_budget',
        resource: 'mirai',
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent'),
      });
      throw new HttpError(
        429,
        `Aylıq MIRAI limit dolub (${spent.toFixed(2)}$ / ${MONTHLY_CAP_USD}$). Növbəti ay yenilənəcək.`,
      );
    }

    // Pre-flight estimate: refuse if even the smallest plausible reply blows
    // the budget. Conservative — assumes input + a 256-token reply.
    const preEstimate = estimateCost(message.length / 4, 256);
    if (!user.isCreator && spent + preEstimate >= MONTHLY_CAP_USD * 1.05) {
      throw new HttpError(
        429,
        'Bu sorğu aylıq MIRAI büdcəsini aşacaq. Xahiş olunur, daha qısa sual ver.',
      );
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

    // RAG: when the message looks like a normative/legal question, pre-fetch
    // top-5 KB chunks via the search_knowledge_base RPC (admin-gated) and
    // splice them into the system prompt. Citations are emitted alongside
    // so the persona's answer can name its sources directly.
    let ragSnippets: Array<{ source: string; chunk: number; text: string }> = [];
    if (user.isAdmin && KB_TRIGGER_RE.test(message)) {
      const embedding = placeholderEmbed(message);
      const { data: hits, error: ragErr } = await sb.rpc('search_knowledge_base', {
        p_embedding: embedding,
        p_limit: 5,
      });
      if (!ragErr && Array.isArray(hits)) {
        ragSnippets = (
          hits as Array<{
            source_pdf: string;
            chunk_index: number;
            content: string;
            similarity: number;
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

    const systemPrompt =
      contextPrefix +
      '\n\n' +
      persona.system +
      (user.isAdmin ? '' : NON_ADMIN_GUARD_RAIL) +
      (ragSnippets.length > 0 ? KB_GUIDANCE : '') +
      ragBlock;

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

    // mirai_conversations + mirai_messages persistence is a v1.5 candidate;
    // we record the message pair already so cost dashboards (PRD §7.9) can
    // attribute spend without re-querying the provider.
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
    const warning =
      !user.isCreator && usagePct >= SOFT_WARN_PCT ? 'budget_80pct' : null;

    return jsonResponse({
      reply,
      persona: personaKey,
      conversation_id: conversationId,
      sources: ragSnippets.map((s) => ({ name: s.source, page: s.chunk })),
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
