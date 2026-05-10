/**
 * US-OKR-02 — Weekly OKR nudge.
 *
 * Runs every Monday morning. For each user with a personal OKR in the active
 * quarter, inserts an `okr_nudge` notification asking them to update progress.
 * Skips users who already have a nudge in the last 6 days (idempotent).
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

function bakuQuarter(): string {
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const q = Math.ceil(m / 3);
  return `${d.getUTCFullYear()}Q${q}`;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const period = bakuQuarter();
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3_600_000).toISOString();

    const { data: okrs } = await sb
      .from('okrs')
      .select('id, employee_id, objective, period')
      .eq('scope', 'personal')
      .eq('period', period)
      .not('employee_id', 'is', null);

    const inserts: Array<{ user_id: string; kind: string; payload: Record<string, unknown> }> = [];
    for (const okr of okrs ?? []) {
      // Dedupe: any nudge for this user in the last 6 days?
      const { data: recent } = await sb
        .from('notifications')
        .select('id')
        .eq('user_id', okr.employee_id)
        .eq('kind', 'okr_nudge')
        .gte('created_at', sixDaysAgo)
        .limit(1)
        .maybeSingle();
      if (recent) continue;

      inserts.push({
        user_id: okr.employee_id as string,
        kind: 'okr_nudge',
        payload: {
          okr_id: okr.id,
          period,
          title: `OKR yenilənməsi: ${okr.objective}`,
        },
      });
    }

    if (inserts.length > 0) {
      await sb.from('notifications').insert(inserts);
    }

    return jsonResponse({ ok: true, period, inserted: inserts.length });
  } catch (e) {
    return errorResponse(e);
  }
}
