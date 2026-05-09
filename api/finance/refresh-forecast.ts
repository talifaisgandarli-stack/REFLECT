/**
 * Admin-triggered forecast refresh — REQ-FIN-08 / US-FIN-07.
 * Rate-limited: 1×/24h per user. Runs the same projection logic as the daily cron.
 * Requires admin auth — no CRON_SECRET exposed to client (PRD §9.1).
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Yalnız adminlər üçündür.');

    const sb = admin();

    // Rate-limit: check if user refreshed in last 24h (using system_settings as kv store)
    const rateLimitKey = `forecast_refresh:${user.id}`;
    const { data: rl } = await sb.from('system_settings').select('value').eq('key', rateLimitKey).maybeSingle();
    if (rl?.value) {
      const last = new Date((rl.value as { at: string }).at).getTime();
      if (Date.now() - last < 24 * 3_600_000) {
        throw new HttpError(429, 'Forecast 24 saatda 1 dəfə yenilənir.');
      }
    }

    // Run forecast projection (same as api/cron/forecast.ts)
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
      generated_by: user.id,
    }));
    await sb.from('cash_forecasts').insert(rows);

    // Record rate-limit stamp
    await sb.from('system_settings').upsert(
      { key: rateLimitKey, value: { at: new Date().toISOString() }, updated_by: user.id },
      { onConflict: 'key' },
    );

    return jsonResponse({ ok: true, generated: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
