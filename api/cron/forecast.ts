/**
 * Daily MIRAI forecast cron — REQ-FIN-08.
 *
 * Pulls 6 months of incomes/expenses + open receivables and asks Claude Haiku
 * to estimate 30/60/90-day balance with low/high confidence bands. Falls back
 * to deterministic linear extrapolation if ANTHROPIC_API_KEY is missing or
 * the model returns malformed JSON — the dashboard always gets numbers.
 *
 * Auth: x-vercel-cron header (Vercel Cron) OR ?key=<CRON_SECRET>.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const HISTORY_DAYS = 180;

type ForecastRow = {
  horizon_days: 30 | 60 | 90;
  projected_balance: number;
  confidence_low: number;
  confidence_high: number;
};

function fallbackForecast(totalIn: number, totalOut: number, openRecv: number): ForecastRow[] {
  // Linear: scale net by horizon, treat receivables as half-realized.
  const net = totalIn - totalOut;
  const balance = net;
  return ([30, 60, 90] as const).map((d) => {
    const scale = d / HISTORY_DAYS;
    const expected = balance + net * scale + openRecv * (scale * 0.5);
    return {
      horizon_days: d,
      projected_balance: round(expected),
      confidence_low: round(balance + net * scale * 0.7),
      confidence_high: round(expected + openRecv * 0.5),
    };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function miraiForecast(
  apiKey: string,
  payload: {
    monthly: { month: string; in: number; out: number }[];
    openReceivables: number;
  },
): Promise<ForecastRow[] | null> {
  try {
    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system:
        'Sən maliyyə analitikisən. Yalnız JSON cavab ver, başqa heç nə yazma. Qaydalar: balansı manatla, real ehtimal əsasında qiymətləndir; mövsümilik və açıq debitorları nəzərə al.',
      messages: [
        {
          role: 'user',
          content: [
            'Aşağıdakı şirkət maliyyə tarixçəsi əsasında 30/60/90 günlük cash forecast hazırla.',
            `Son 6 ay (giriş/çıxış AZN): ${JSON.stringify(payload.monthly)}`,
            `Açıq debitor (gözlənilən gəlir): ${payload.openReceivables} AZN`,
            '',
            'Çıxış formatı (yalnız JSON):',
            '{"forecasts":[{"horizon_days":30,"projected_balance":N,"confidence_low":N,"confidence_high":N}, ...]}',
          ].join('\n'),
        },
      ],
    });
    const text = completion.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n');
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as { forecasts?: ForecastRow[] };
    const rows = parsed.forecasts ?? [];
    const valid = rows.filter(
      (r) =>
        [30, 60, 90].includes(r.horizon_days) &&
        Number.isFinite(r.projected_balance) &&
        Number.isFinite(r.confidence_low) &&
        Number.isFinite(r.confidence_high),
    );
    if (valid.length !== 3) return null;
    return valid.map((r) => ({
      horizon_days: r.horizon_days,
      projected_balance: round(r.projected_balance),
      confidence_low: round(r.confidence_low),
      confidence_high: round(r.confidence_high),
    }));
  } catch {
    return null;
  }
}

function aggregateMonthly(
  rows: { amount: number | null; occurred_at: string | null }[] | null,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.occurred_at) continue;
    const m = r.occurred_at.slice(0, 7); // YYYY-MM
    out.set(m, (out.get(m) ?? 0) + Number(r.amount ?? 0));
  }
  return out;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' || url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 3_600_000).toISOString();

    const [incQ, expQ, recQ] = await Promise.all([
      sb.from('incomes').select('amount, occurred_at').gte('occurred_at', since),
      sb.from('expenses').select('amount, occurred_at').gte('occurred_at', since),
      sb.from('receivables').select('amount').neq('status', 'paid'),
    ]);

    const totalIn = (incQ.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalOut = (expQ.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const openRecv = (recQ.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const monthsIn = aggregateMonthly(incQ.data);
    const monthsOut = aggregateMonthly(expQ.data);
    const months = Array.from(new Set([...monthsIn.keys(), ...monthsOut.keys()])).sort();
    const monthly = months.map((m) => ({
      month: m,
      in: round(monthsIn.get(m) ?? 0),
      out: round(monthsOut.get(m) ?? 0),
    }));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let rows: ForecastRow[] | null = null;
    let source: 'mirai' | 'fallback' = 'fallback';
    if (apiKey && monthly.length > 0) {
      rows = await miraiForecast(apiKey, { monthly, openReceivables: openRecv });
      if (rows) source = 'mirai';
    }
    if (!rows) rows = fallbackForecast(totalIn, totalOut, openRecv);

    await sb.from('cash_forecasts').insert(rows);
    return jsonResponse({ ok: true, generated: rows.length, source });
  } catch (e) {
    return errorResponse(e);
  }
}
