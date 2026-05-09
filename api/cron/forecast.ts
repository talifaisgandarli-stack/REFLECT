/**
 * Daily MIRAI forecast cron — REQ-FIN-08.
 *
 * 1. Aggregates current incomes/expenses (all-time; serves as the "balance").
 * 2. Calls MIRAI "Maliyyə Analitiki" persona (Claude Haiku 4.5 per PRD §3.1)
 *    to produce a short Azerbaijani narrative for each 30/60/90-day horizon.
 * 3. Inserts cash_forecasts rows with projected_balance, confidence range,
 *    and the MIRAI-generated narrative (REQ-FIN-08 + migration 0011).
 *
 * Auth: x-vercel-cron header OR ?key=<CRON_SECRET>.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001'; // PRD §3.1

function bakuToday(): string {
  return new Intl.DateTimeFormat('az-AZ', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

async function generateNarrative(
  client: Anthropic,
  balance: number,
  projected: number,
  horizon: number,
  confidenceLow: number,
  confidenceHigh: number,
): Promise<string> {
  try {
    const prompt =
      `Sən Reflect arxitektura studiyasının "Maliyyə Analitiki" köməkçisisən. ` +
      `Bu gün: ${bakuToday()}. ` +
      `Cari balans: ${Math.round(balance)} AZN. ` +
      `${horizon} günlük proqnoz: ${Math.round(projected)} AZN ` +
      `(ehtimal aralığı: ${Math.round(confidenceLow)}–${Math.round(confidenceHigh)} AZN). ` +
      `Bu göstəricilər əsasında 2-3 cümlədə qısa analitik şərh ver. ` +
      `Əmin olmadığın məsələlər üçün "təxmini" sözündən istifadə et.`;

    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system:
        'Sən Maliyyə Analitikisən. Qısa, dəqiq Azərbaycan dilində cavab ver. Disclaimer: proqnoz riyazi model əsasındadır.',
      messages: [{ role: 'user', content: prompt }],
    });
    return (
      completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('')
        .trim() || ''
    );
  } catch {
    return '';
  }
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();
    const { data: incomes } = await sb.from('incomes').select('amount, occurred_at');
    const { data: expenses } = await sb.from('expenses').select('amount, occurred_at');

    const totalIn = (incomes ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalOut = (expenses ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const balance = totalIn - totalOut;
    const monthlyNet = totalIn - totalOut; // simple linear assumption

    const client = new Anthropic({ apiKey });

    const rows = await Promise.all(
      [30, 60, 90].map(async (d) => {
        const projected = balance + monthlyNet * (d / 30) * 0.6;
        const confidenceLow = balance;
        const confidenceHigh = balance + monthlyNet * (d / 30);
        const narrative = await generateNarrative(
          client,
          balance,
          projected,
          d,
          confidenceLow,
          confidenceHigh,
        );
        return { horizon_days: d, projected_balance: projected, confidence_low: confidenceLow, confidence_high: confidenceHigh, narrative };
      }),
    );

    await sb.from('cash_forecasts').insert(rows);
    return jsonResponse({ ok: true, generated: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
