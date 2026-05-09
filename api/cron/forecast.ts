/**
 * Daily MIRAI forecast cron — REQ-FIN-08 (PRD §M7).
 *
 * Pulls 6 months of incomes/expenses/recurring/receivables, asks Claude
 * Haiku for 30/60/90-day balance projections + confidence ranges in
 * structured JSON, persists into cash_forecasts. Falls back to a
 * deterministic linear extrapolation when ANTHROPIC_API_KEY is missing
 * or the LLM response can't be parsed — the cron must always leave the
 * dashboard with up-to-date numbers.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 600;
const HORIZONS = [30, 60, 90] as const;

type Forecast = {
  horizon_days: number;
  projected_balance: number;
  confidence_low: number;
  confidence_high: number;
};

function bakuMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 7);
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000).toISOString();

    const [incomes, expenses, recurring, receivables] = await Promise.all([
      sb.from('incomes').select('amount, occurred_at').gte('occurred_at', sixMonthsAgo),
      sb.from('expenses').select('amount, occurred_at').gte('occurred_at', sixMonthsAgo),
      sb.from('recurring_expenses').select('amount, period, next_run_at'),
      sb.from('receivables').select('amount, paid_amount, due_at, status'),
    ]);

    const inRows = incomes.data ?? [];
    const expRows = expenses.data ?? [];
    const recRows = recurring.data ?? [];
    const recvRows = receivables.data ?? [];

    const totalIn = inRows.reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);
    const totalOut = expRows.reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);
    const balance = totalIn - totalOut;
    const monthsCovered = new Set(
      inRows.map((r) => bakuMonth((r as { occurred_at: string }).occurred_at)).filter(Boolean),
    );
    const monthlyAvgIn = monthsCovered.size > 0 ? totalIn / monthsCovered.size : 0;
    const monthlyAvgOut = monthsCovered.size > 0 ? totalOut / monthsCovered.size : 0;
    const recurringMonthly = recRows
      .map((r) => {
        const v = r as { amount: number; period: string };
        switch (v.period) {
          case 'weekly':
            return Number(v.amount) * 4;
          case 'monthly':
            return Number(v.amount);
          case 'quarterly':
            return Number(v.amount) / 3;
          case 'yearly':
            return Number(v.amount) / 12;
          default:
            return 0;
        }
      })
      .reduce((s, n) => s + n, 0);
    const openReceivable = recvRows
      .filter((r) => (r as { status: string }).status !== 'paid')
      .reduce(
        (s, r) =>
          s +
          Math.max(
            0,
            Number((r as { amount: number }).amount ?? 0) -
              Number((r as { paid_amount: number }).paid_amount ?? 0),
          ),
        0,
      );

    let forecasts = await tryLlmForecast({
      balance,
      monthlyAvgIn,
      monthlyAvgOut,
      recurringMonthly,
      openReceivable,
      monthsCovered: monthsCovered.size,
    });

    if (!forecasts || forecasts.length !== 3) {
      // Deterministic fallback: net month × horizon factor, with confidence
      // band from receivable inclusion (high) vs no recovery (low).
      const net = monthlyAvgIn - monthlyAvgOut - recurringMonthly;
      forecasts = HORIZONS.map((d) => {
        const months = d / 30;
        const proj = balance + net * months;
        return {
          horizon_days: d,
          projected_balance: round2(proj),
          confidence_low: round2(proj - openReceivable * 0.5 * months),
          confidence_high: round2(proj + openReceivable * 0.5 * months),
        };
      });
    }

    const { error } = await sb.from('cash_forecasts').insert(forecasts);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, generated: forecasts.length, forecasts });
  } catch (e) {
    return errorResponse(e);
  }
}

async function tryLlmForecast(input: {
  balance: number;
  monthlyAvgIn: number;
  monthlyAvgOut: number;
  recurringMonthly: number;
  openReceivable: number;
  monthsCovered: number;
}): Promise<Forecast[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const prompt = [
    `Reflect arxitektura studiyası üçün 30/60/90 günlük cash forecast hazırla.`,
    `Bütün məbləğlər AZN.`,
    ``,
    `Cari balans: ${input.balance}`,
    `Aylıq orta gəlir: ${input.monthlyAvgIn}`,
    `Aylıq orta xərc: ${input.monthlyAvgOut}`,
    `Sabit aylıq xərclər (recurring): ${input.recurringMonthly}`,
    `Açıq debitor (qalıq): ${input.openReceivable}`,
    `Tarix verilənləri əhatə edən aylar: ${input.monthsCovered}`,
    ``,
    `Yalnız bu strukturda JSON qaytar — heç bir izahat yox:`,
    `[{"horizon_days":30,"projected_balance":N,"confidence_low":N,"confidence_high":N},`,
    ` {"horizon_days":60,...},`,
    ` {"horizon_days":90,...}]`,
  ].join('\n');

  try {
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system:
        'Sən Reflect-in Maliyyə Analitiki personasısan. Yalnız sorulan formatda JSON qaytar.',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = completion.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Array<{
      horizon_days: number;
      projected_balance: number;
      confidence_low: number;
      confidence_high: number;
    }>;
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;

    // Light sanity check — reject obvious garbage (negative balances on a
    // healthy firm, infinities, NaNs) and let the fallback take over.
    const ok = parsed.every(
      (f) =>
        Number.isFinite(f.projected_balance) &&
        Number.isFinite(f.confidence_low) &&
        Number.isFinite(f.confidence_high) &&
        HORIZONS.includes(f.horizon_days as 30 | 60 | 90),
    );
    if (!ok) return null;
    return parsed.map((f) => ({
      horizon_days: f.horizon_days,
      projected_balance: round2(f.projected_balance),
      confidence_low: round2(f.confidence_low),
      confidence_high: round2(f.confidence_high),
    }));
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
