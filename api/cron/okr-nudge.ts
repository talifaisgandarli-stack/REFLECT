/**
 * Weekly OKR nudge — PRD §9.1 / US-OKR-02 final AC.
 * For each personal OKR whose key_results have not been updated in ≥7 days,
 * insert one in-app notification per owner. Idempotent within a 7-day window:
 * we skip if a 'okr_nudge' notification was already created for the user
 * within the last 6 days.
 *
 * Auth: x-vercel-cron header OR ?key=<CRON_SECRET>.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const STALE_DAYS = 7;
const REPEAT_GUARD_DAYS = 6;

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();

    // Personal OKRs only — we don't nudge for company OKRs (no individual owner).
    const { data: okrs, error: okrErr } = await sb
      .from('okrs')
      .select('id, employee_id, objective')
      .eq('scope', 'personal')
      .not('employee_id', 'is', null);
    if (okrErr) throw okrErr;

    const okrIds = (okrs ?? []).map((o) => o.id);
    if (okrIds.length === 0) return jsonResponse({ ok: true, nudged: 0 });

    const { data: krs, error: krErr } = await sb
      .from('key_results')
      .select('okr_id, updated_at')
      .in('okr_id', okrIds);
    if (krErr) throw krErr;

    // Compute the most recent update per OKR.
    const latestByOkr = new Map<string, string>();
    for (const k of krs ?? []) {
      const cur = latestByOkr.get(k.okr_id);
      if (!cur || k.updated_at > cur) latestByOkr.set(k.okr_id, k.updated_at);
    }

    const now = Date.now();
    const staleCutoff = now - STALE_DAYS * 86_400_000;
    const guardCutoff = new Date(now - REPEAT_GUARD_DAYS * 86_400_000).toISOString();

    // Group stale OKRs by owner so each owner gets one notification per run.
    const staleByOwner = new Map<string, { okrId: string; objective: string }[]>();
    for (const o of okrs ?? []) {
      const last = latestByOkr.get(o.id);
      // No KRs at all → counts as stale (creator should add some).
      const lastTs = last ? new Date(last).getTime() : 0;
      if (lastTs >= staleCutoff) continue;
      const arr = staleByOwner.get(o.employee_id!) ?? [];
      arr.push({ okrId: o.id, objective: o.objective });
      staleByOwner.set(o.employee_id!, arr);
    }

    // Repeat guard: skip owners who already got an okr_nudge in the last 6 days.
    let nudged = 0;
    for (const [userId, items] of staleByOwner.entries()) {
      const { data: recent } = await sb
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('kind', 'okr_nudge')
        .gte('created_at', guardCutoff)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const { error } = await sb.from('notifications').insert({
        user_id: userId,
        kind: 'okr_nudge',
        payload: {
          stale_okrs: items.length,
          objectives: items.slice(0, 3).map((i) => i.objective),
        },
      });
      if (!error) nudged += 1;
    }

    return jsonResponse({ ok: true, candidates: staleByOwner.size, nudged });
  } catch (e) {
    return errorResponse(e);
  }
}
