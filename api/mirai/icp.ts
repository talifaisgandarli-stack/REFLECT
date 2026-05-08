/**
 * REQ-CRM-04 — AI ICP enrichment via MIRAI.
 *
 *   "AI ICP enrichment via MIRAI (cached `ai_icp_fit` until inputs change;
 *    refresh max 1×/24h/client)."
 *
 * Surface:
 *   POST /api/mirai/icp { client_id }
 *
 * Behavior:
 *   - Admin-only (RLS on `clients` is admin-only; the score is a sales
 *     signal, not user data).
 *   - 24h cache. If ai_icp_calculated_at is within the last 24h, return
 *     the cached value with cached: true. ?force=1 query param overrides
 *     the cache (also rate-limited at 1×/24h to keep the spec honest).
 *   - Persona = "strategist" (PRD §7.2). Prompt enforces JSON-only output
 *     so we can read score + reason cleanly. One retry on parse failure.
 *   - Cost is logged to mirai_usage_log for the calling user, same as
 *     /api/mirai/chat — preserves the §7.6 budget guard envelope.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  admin,
  errorResponse,
  HttpError,
  jsonResponse,
  requireUser,
} from '../_lib/auth';

export const config = { runtime: 'edge' };

const CACHE_HOURS = 24;
const PRICE_IN_PER_MTOK = 0.25;
const PRICE_OUT_PER_MTOK = 1.25;
const MAX_OUTPUT = 256;

const SYSTEM = `You are MIRAI in Strateq persona, scoring how well a prospect fits the studio's Ideal Customer Profile (ICP) for an architecture studio in Baku. Output STRICTLY a single JSON object, no prose, no markdown, with shape:

{"score": <integer 0-100>, "reason": "<one sentence in Azerbaijani, max 160 chars>"}

Score bands:
  70-100 → strong fit
  40-69  → marginal
  0-39   → poor fit

If you cannot determine a score, use score=50 and reason="Yetərli məlumat yoxdur." Do NOT include any other keys.`;

type Body = { client_id?: string };
type ClientRow = {
  id: string;
  name: string;
  company: string | null;
  pipeline_stage: string;
  confidence_pct: number;
  expected_value: number | null;
  ai_icp_fit: number | null;
  ai_icp_calculated_at: string | null;
};
type Interaction = { type: string; note: string | null; occurred_at: string };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';

    const body = (await req.json()) as Body;
    const clientId = body.client_id?.trim();
    if (!clientId) throw new HttpError(400, 'client_id required');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();

    const { data: client, error: cErr } = await sb
      .from('clients')
      .select(
        'id, name, company, pipeline_stage, confidence_pct, expected_value, ai_icp_fit, ai_icp_calculated_at',
      )
      .eq('id', clientId)
      .maybeSingle();
    if (cErr) throw new HttpError(500, cErr.message);
    if (!client) throw new HttpError(404, 'Client not found');

    // Cache: PRD §6 "refresh max 1×/24h/client". Honored even with ?force=1
    // so a misbehaving client can't drain budget.
    const last = (client as ClientRow).ai_icp_calculated_at;
    const fresh =
      last != null && Date.now() - new Date(last).getTime() < CACHE_HOURS * 3_600_000;
    if (fresh) {
      return jsonResponse({
        score: (client as ClientRow).ai_icp_fit,
        cached: true,
        calculated_at: last,
      });
    }
    if (!force && last != null) {
      // Inside the cache window but ai_icp_fit may be null (e.g. legacy
      // rows). Fall through to compute.
    }

    const { data: interactions } = await sb
      .from('client_interactions')
      .select('type, note, occurred_at')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .limit(5);

    const userMsg = buildPrompt(client as ClientRow, (interactions ?? []) as Interaction[]);

    const anth = new Anthropic({ apiKey });
    const parsed = await callWithRetry(anth, userMsg);

    const computedAt = new Date().toISOString();
    await sb
      .from('clients')
      .update({
        ai_icp_fit: parsed.score,
        ai_icp_calculated_at: computedAt,
      })
      .eq('id', clientId);

    // Cost accounting parity with /api/mirai/chat.
    const period = new Date();
    const yyyymm = period.getUTCFullYear() * 100 + (period.getUTCMonth() + 1);
    const tIn = parsed.usage.input_tokens;
    const tOut = parsed.usage.output_tokens;
    const cost = (tIn / 1_000_000) * PRICE_IN_PER_MTOK + (tOut / 1_000_000) * PRICE_OUT_PER_MTOK;
    const { data: usage } = await sb
      .from('mirai_usage_log')
      .select('cost_usd, tokens_in, tokens_out')
      .eq('user_id', user.id)
      .eq('period_yyyymm', yyyymm)
      .maybeSingle();
    await sb.from('mirai_usage_log').upsert(
      {
        user_id: user.id,
        period_yyyymm: yyyymm,
        tokens_in: Number(usage?.tokens_in ?? 0) + tIn,
        tokens_out: Number(usage?.tokens_out ?? 0) + tOut,
        cost_usd: Number(usage?.cost_usd ?? 0) + cost,
      },
      { onConflict: 'user_id,period_yyyymm' },
    );

    return jsonResponse({
      score: parsed.score,
      reason: parsed.reason,
      cached: false,
      calculated_at: computedAt,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function buildPrompt(client: ClientRow, interactions: Interaction[]): string {
  const lines: string[] = [];
  lines.push(`Müştəri: ${client.name}${client.company ? ` (${client.company})` : ''}`);
  lines.push(`Pipeline mərhələsi: ${client.pipeline_stage}`);
  lines.push(`Güvən: ${client.confidence_pct}%`);
  if (client.expected_value != null) {
    lines.push(`Gözlənilən dəyər: ${client.expected_value} AZN`);
  }
  if (interactions.length > 0) {
    lines.push('');
    lines.push('Son əlaqələr:');
    for (const i of interactions) {
      const date = i.occurred_at.slice(0, 10);
      lines.push(`- ${date} · ${i.type}${i.note ? ` — ${i.note.slice(0, 200)}` : ''}`);
    }
  } else {
    lines.push('');
    lines.push('Son əlaqələr: yoxdur.');
  }
  lines.push('');
  lines.push('JSON ilə cavab ver.');
  return lines.join('\n');
}

async function callWithRetry(
  client: Anthropic,
  userMessage: string,
): Promise<{ score: number; reason: string; usage: { input_tokens: number; output_tokens: number } }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: MAX_OUTPUT,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = completion.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();
    const parsed = tryParse(text);
    if (parsed) {
      return {
        score: parsed.score,
        reason: parsed.reason,
        usage: {
          input_tokens: completion.usage?.input_tokens ?? 0,
          output_tokens: completion.usage?.output_tokens ?? 0,
        },
      };
    }
  }
  throw new HttpError(502, 'MIRAI invalid JSON after retry');
}

function tryParse(text: string): { score: number; reason: string } | null {
  // Tolerate accidental Markdown fencing.
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    const obj = JSON.parse(stripped) as { score?: unknown; reason?: unknown };
    const s = Number(obj.score);
    const r = typeof obj.reason === 'string' ? obj.reason : '';
    if (!Number.isFinite(s) || s < 0 || s > 100) return null;
    return { score: Math.round(s), reason: r.slice(0, 240) };
  } catch {
    return null;
  }
}
