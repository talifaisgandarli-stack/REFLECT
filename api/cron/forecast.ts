/**
 * Daily MIRAI cash-forecast cron — REQ-FIN-08.
 * Persona: "Maliyyə Analitiki" (PRD §7). Model: Claude Haiku 4.5 (PRD §3.1).
 * Uses Anthropic tool_use with a strict schema for structured output;
 * falls back to a deterministic heuristic if the model misbehaves so the
 * dashboard never goes dark.
 *
 * Auth: x-vercel-cron header OR ?key=<CRON_SECRET>.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type Horizon = 30 | 60 | 90;
type ForecastRow = {
  horizon_days: Horizon;
  projected_balance: number;
  confidence_low: number;
  confidence_high: number;
};

const SYSTEM = [
  'You are MIRAI in the "Maliyyə Analitiki" (Finance Analyst) persona for an',
  'architecture studio in Baku. You produce conservative cash-flow forecasts.',
  '',
  'Inputs you receive:',
  '- monthly aggregates (income, expense, net) for the last 12 months',
  '- current balance (income to date − expense to date)',
  '',
  'Output: call the `submit_forecasts` tool with one entry per horizon',
  '(30, 60, 90 days). projected_balance is the median expectation;',
  'confidence_low / confidence_high bracket a ~80% range. All values in AZN.',
  '',
  'Rules:',
  '- Anchor to the data; do not invent revenue. If recent months show a loss',
  '  trend, reflect that.',
  '- confidence_low ≤ projected_balance ≤ confidence_high.',
  '- Round to whole numbers.',
].join('\n');

const TOOL = {
  name: 'submit_forecasts',
  description: 'Submit one forecast row per horizon (30/60/90 days).',
  input_schema: {
    type: 'object',
    properties: {
      forecasts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            horizon_days: { type: 'integer', enum: [30, 60, 90] },
            projected_balance: { type: 'number' },
            confidence_low: { type: 'number' },
            confidence_high: { type: 'number' },
          },
          required: ['horizon_days', 'projected_balance', 'confidence_low', 'confidence_high'],
          additionalProperties: false,
        },
        minItems: 3,
        maxItems: 3,
      },
    },
    required: ['forecasts'],
    additionalProperties: false,
  },
} as const;

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const { data: incomes } = await sb.from('incomes').select('amount, occurred_at');
    const { data: expenses } = await sb.from('expenses').select('amount, occurred_at');

    const months = bucketByMonth(incomes ?? [], expenses ?? []);
    const totalIn = (incomes ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalOut = (expenses ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const balance = totalIn - totalOut;

    let rows: ForecastRow[];
    let source: 'mirai' | 'heuristic' = 'heuristic';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        rows = await runMirai(apiKey, balance, months);
        source = 'mirai';
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[forecast] MIRAI failed, falling back to heuristic:', e);
        rows = heuristic(balance, months);
      }
    } else {
      rows = heuristic(balance, months);
    }

    rows = rows.map(clampConfidence);

    const { error } = await sb.from('cash_forecasts').insert(rows);
    if (error) throw error;

    return jsonResponse({ ok: true, generated: rows.length, source });
  } catch (e) {
    return errorResponse(e);
  }
}

async function runMirai(
  apiKey: string,
  balance: number,
  months: { ym: string; in: number; out: number; net: number }[],
): Promise<ForecastRow[]> {
  const client = new Anthropic({ apiKey });
  const userMessage = JSON.stringify(
    {
      current_balance_azn: Math.round(balance),
      months_last_12: months.slice(-12),
    },
    null,
    2,
  );

  const completion = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM,
    tools: [TOOL] as unknown as Anthropic.Messages.Tool[],
    tool_choice: { type: 'tool', name: 'submit_forecasts' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = completion.content.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; name: string; input: { forecasts: ForecastRow[] } }
    | undefined;
  if (!block || block.name !== 'submit_forecasts') {
    throw new Error('No tool_use returned');
  }
  const forecasts = block.input.forecasts;
  if (!Array.isArray(forecasts) || forecasts.length !== 3) {
    throw new Error('Wrong forecast shape');
  }
  // Ensure all three horizons are present.
  const seen = new Set(forecasts.map((f) => f.horizon_days));
  for (const h of [30, 60, 90] as Horizon[]) {
    if (!seen.has(h)) throw new Error(`Missing horizon ${h}`);
  }
  return forecasts;
}

function heuristic(
  balance: number,
  months: { ym: string; in: number; out: number; net: number }[],
): ForecastRow[] {
  const recent = months.slice(-3);
  const avgNet =
    recent.length > 0 ? recent.reduce((s, m) => s + m.net, 0) / recent.length : 0;
  return ([30, 60, 90] as Horizon[]).map((d) => {
    const projected = balance + (avgNet * d) / 30;
    const spread = Math.abs(avgNet) * (d / 30);
    return {
      horizon_days: d,
      projected_balance: Math.round(projected),
      confidence_low: Math.round(projected - spread),
      confidence_high: Math.round(projected + spread),
    };
  });
}

function clampConfidence(r: ForecastRow): ForecastRow {
  const lo = Math.min(r.confidence_low, r.projected_balance);
  const hi = Math.max(r.confidence_high, r.projected_balance);
  return {
    horizon_days: r.horizon_days,
    projected_balance: Math.round(r.projected_balance),
    confidence_low: Math.round(lo),
    confidence_high: Math.round(hi),
  };
}

function bucketByMonth(
  ins: { amount: number | null; occurred_at: string | null }[],
  outs: { amount: number | null; occurred_at: string | null }[],
) {
  const m = new Map<string, { ym: string; in: number; out: number; net: number }>();
  function add(arr: typeof ins, key: 'in' | 'out') {
    for (const r of arr) {
      const ym = (r.occurred_at ?? '').slice(0, 7);
      if (!ym) continue;
      const cur = m.get(ym) ?? { ym, in: 0, out: 0, net: 0 };
      cur[key] += Number(r.amount ?? 0);
      cur.net = cur.in - cur.out;
      m.set(ym, cur);
    }
  }
  add(ins, 'in');
  add(outs, 'out');
  return [...m.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}
