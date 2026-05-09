/**
 * Recurring expenses materialization — REQ-FIN-05.
 *
 * Runs daily via Vercel Cron. Finds every recurring_expenses row whose
 * next_run_at has passed, inserts a corresponding expenses row (with
 * recurring_rule_id set for traceability), then advances next_run_at by
 * the configured period so the rule fires again on schedule.
 *
 * Period math is done in Asia/Baku calendar to match REQ-FIN-09.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const TZ = 'Asia/Baku';

/** Advance a date by one period in Baku calendar. */
function nextRunAt(current: Date, period: string): string {
  const d = new Date(current);
  switch (period) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'monthly': {
      // Advance by one calendar month in Baku tz so billing aligns to
      // the Baku month boundary (REQ-FIN-09).
      const localStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(current);
      const [y, m, day] = localStr.split('-').map(Number);
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      return `${nextY}-${String(nextM).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+04:00`;
    }
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString();
}

type RecurringRow = {
  id: string;
  label: string;
  amount: number;
  period: string;
  next_run_at: string;
};

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const now = new Date().toISOString();

    const { data: due, error } = await sb
      .from('recurring_expenses')
      .select('id, label, amount, period, next_run_at')
      .lte('next_run_at', now);
    if (error) throw new HttpError(500, error.message);

    const rows = (due ?? []) as RecurringRow[];
    if (rows.length === 0) return jsonResponse({ ok: true, materialized: 0 });

    let materialized = 0;
    for (const rule of rows) {
      // Insert expenses row linked to the rule
      const { error: insertErr } = await sb.from('expenses').insert({
        category: 'sabit_xərc',
        amount: rule.amount,
        note: rule.label,
        occurred_at: rule.next_run_at,
        recurring_rule_id: rule.id,
      });
      if (insertErr) continue;

      // Advance next_run_at
      const next = nextRunAt(new Date(rule.next_run_at), rule.period);
      await sb.from('recurring_expenses').update({ next_run_at: next }).eq('id', rule.id);
      materialized++;
    }

    return jsonResponse({ ok: true, materialized });
  } catch (e) {
    return errorResponse(e);
  }
}
