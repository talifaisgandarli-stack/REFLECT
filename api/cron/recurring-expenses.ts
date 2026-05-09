/**
 * Daily recurring-expenses materializer — REQ-FIN-05 / US-FIN-05.
 * For each recurring_expenses row whose next_run_at <= now(), insert an
 * expenses row with recurring_rule_id linked, then advance next_run_at by
 * one period. Loops in case multiple periods elapsed since last run.
 * Auth: x-vercel-cron header (Vercel Cron) OR ?key=<CRON_SECRET>.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type Period = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export function advance(date: Date, period: Period): Date {
  const d = new Date(date.getTime());
  if (period === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (period === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (period === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (period === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const now = new Date();
    const { data: rules, error } = await sb
      .from('recurring_expenses')
      .select('id, label, amount, period, next_run_at')
      .lte('next_run_at', now.toISOString());
    if (error) throw new HttpError(500, error.message);

    let materialized = 0;
    for (const rule of rules ?? []) {
      let nextRun = new Date(rule.next_run_at);
      const period = rule.period as Period;
      while (nextRun.getTime() <= now.getTime()) {
        const occurredAt = nextRun.toISOString();
        const { data: exp, error: insErr } = await sb
          .from('expenses')
          .insert({
            amount: rule.amount,
            category: 'recurring',
            note: rule.label,
            occurred_at: occurredAt,
            recurring_rule_id: rule.id,
          })
          .select('id')
          .single();
        if (insErr) throw new HttpError(500, insErr.message);
        await sb.from('activity_log').insert({
          entity_type: 'expense',
          entity_id: exp.id,
          action: 'recurring_materialized',
          new_value: { recurring_rule_id: rule.id, label: rule.label, amount: rule.amount },
        });
        materialized++;
        nextRun = advance(nextRun, period);
      }
      await sb
        .from('recurring_expenses')
        .update({ next_run_at: nextRun.toISOString() })
        .eq('id', rule.id);
    }

    return jsonResponse({ ok: true, rules: rules?.length ?? 0, materialized });
  } catch (e) {
    return errorResponse(e);
  }
}
