/**
 * Recurring expenses materializer cron — REQ-FIN-05.
 * Calls public.materialize_recurring_expenses() to insert missed periods.
 * Auth: x-vercel-cron header OR ?key=<CRON_SECRET>.
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
    if (error) throw error;

    return jsonResponse({ ok: true, materialized: data ?? 0 });
  } catch (e) {
    return errorResponse(e);
  }
}
