/**
 * Daily MIRAI forecast cron — REQ-FIN-08.
 * Generates cash_forecasts rows for 30/60/90-day horizons.
 * Auth: x-vercel-cron header (Vercel Cron) OR ?key=<CRON_SECRET>.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' || url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const { data: incomes } = await sb.from('incomes').select('amount, occurred_at');
    const { data: expenses } = await sb.from('expenses').select('amount, occurred_at');

    const totalIn = (incomes ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalOut = (expenses ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const balance = totalIn - totalOut;

    const rows = [30, 60, 90].map((d) => ({
      horizon_days: d,
      projected_balance: balance + (totalIn - totalOut) * (d / 30) * 0.6,
      confidence_low: balance,
      confidence_high: balance + (totalIn - totalOut) * (d / 30),
    }));
    await sb.from('cash_forecasts').insert(rows);
    return jsonResponse({ ok: true, generated: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
