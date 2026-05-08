/**
 * REQ-FIN-05 — daily materializer for recurring_expenses.
 *
 * Backstop for environments without pg_cron. PRD §3.2 names pg_cron as the
 * canonical scheduler; the SQL function this route calls
 * (materialize_recurring_expenses) is the same function pg_cron would invoke
 * if/when the operator enables the extension. Either path is correct.
 *
 * Auth: Vercel cron header OR ?key=$CRON_SECRET — same pattern as
 * api/cron/cmo.ts and api/cron/forecast.ts.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const { data, error } = await sb.rpc('materialize_recurring_expenses');
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, processed: Number(data ?? 0) });
  } catch (e) {
    return errorResponse(e);
  }
}
