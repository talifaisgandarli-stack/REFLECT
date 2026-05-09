/**
 * Finance alert cron — PRD §8.1.
 *
 * Runs daily. Checks incomes and expenses created in the last 25 hours
 * (slight overlap ensures no gaps across cron timing drift). For each row
 * exceeding the configured threshold (from system_settings), inserts a
 * finance_alert notification for all admin/creator profiles.
 *
 * Thresholds stored in system_settings:
 *   key = "finance_alert_income_threshold"  → value: { azn: number }  (default 5000)
 *   key = "finance_alert_expense_threshold" → value: { azn: number }  (default 2000)
 *
 * Also flags overdue receivables (due_date < today, status != paid).
 *
 * Hard rule (PRD §8.1): finance_alert notifications routed to Telegram only for
 * admin chat IDs — enforced in notify-fanout.ts, not here.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const DEFAULT_INCOME_THRESHOLD = 5_000;
const DEFAULT_EXPENSE_THRESHOLD = 2_000;

function bakuDateISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function getThreshold(
  sb: ReturnType<typeof admin>,
  key: string,
  fallback: number,
): Promise<number> {
  const { data } = await sb.from('system_settings').select('value').eq('key', key).maybeSingle();
  const v = data?.value as { azn?: number } | undefined;
  return typeof v?.azn === 'number' && v.azn > 0 ? v.azn : fallback;
}

async function getAdminUserIds(sb: ReturnType<typeof admin>): Promise<string[]> {
  const { data: roles } = await sb.from('roles').select('id').eq('is_admin', true);
  const adminRoleIds = (roles ?? []).map((r) => r.id);

  const { data: profiles } = await sb
    .from('profiles')
    .select('id')
    .or(
      [
        'is_creator.eq.true',
        adminRoleIds.length > 0 ? `role_id.in.(${adminRoleIds.join(',')})` : null,
      ]
        .filter(Boolean)
        .join(','),
    );
  return (profiles ?? []).map((p) => p.id);
}

async function dedupeKey(sb: ReturnType<typeof admin>, kind: string, userId: string, entityId: string): Promise<boolean> {
  // Returns true if a notification already exists for this entity+user today.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data } = await sb
    .from('notifications')
    .select('id')
    .eq('kind', kind)
    .eq('user_id', userId)
    .contains('payload', { entity_id: entityId })
    .gte('created_at', todayStart.toISOString())
    .maybeSingle();
  return !!data;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const since = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const today = bakuDateISO();

    const [incomeThreshold, expenseThreshold, adminIds] = await Promise.all([
      getThreshold(sb, 'finance_alert_income_threshold', DEFAULT_INCOME_THRESHOLD),
      getThreshold(sb, 'finance_alert_expense_threshold', DEFAULT_EXPENSE_THRESHOLD),
      getAdminUserIds(sb),
    ]);

    if (adminIds.length === 0) return jsonResponse({ ok: true, inserted: 0 });

    const inserts: Array<{ user_id: string; kind: string; payload: Record<string, unknown> }> = [];

    // --- High-value incomes --------------------------------------------------
    const { data: incomes } = await sb
      .from('incomes')
      .select('id, amount, client_id, project_id, occurred_at')
      .gte('occurred_at', since)
      .gte('amount', incomeThreshold);

    for (const inc of incomes ?? []) {
      for (const uid of adminIds) {
        if (await dedupeKey(sb, 'finance_alert', uid, inc.id)) continue;
        inserts.push({
          user_id: uid,
          kind: 'finance_alert',
          payload: {
            entity_id: inc.id,
            subkind: 'high_income',
            amount: inc.amount,
            threshold: incomeThreshold,
            occurred_at: inc.occurred_at,
            title: `Böyük gəlir: ${Number(inc.amount).toLocaleString('az-AZ')} AZN`,
          },
        });
      }
    }

    // --- High-value expenses -------------------------------------------------
    const { data: expenses } = await sb
      .from('expenses')
      .select('id, amount, category, occurred_at')
      .gte('occurred_at', since)
      .gte('amount', expenseThreshold);

    for (const exp of expenses ?? []) {
      for (const uid of adminIds) {
        if (await dedupeKey(sb, 'finance_alert', uid, exp.id)) continue;
        inserts.push({
          user_id: uid,
          kind: 'finance_alert',
          payload: {
            entity_id: exp.id,
            subkind: 'high_expense',
            amount: exp.amount,
            threshold: expenseThreshold,
            category: exp.category,
            occurred_at: exp.occurred_at,
            title: `Böyük xərc: ${Number(exp.amount).toLocaleString('az-AZ')} AZN`,
          },
        });
      }
    }

    // --- Overdue receivables -------------------------------------------------
    const { data: receivables } = await sb
      .from('receivables')
      .select('id, amount, due_at, client_id, project_id')
      .lt('due_at', today)
      .not('status', 'eq', 'paid');

    for (const rec of receivables ?? []) {
      for (const uid of adminIds) {
        if (await dedupeKey(sb, 'finance_alert', uid, rec.id)) continue;
        inserts.push({
          user_id: uid,
          kind: 'finance_alert',
          payload: {
            entity_id: rec.id,
            subkind: 'overdue_receivable',
            amount: rec.amount,
            due_at: rec.due_at,
            title: `Gecikmiş debitor: ${Number(rec.amount).toLocaleString('az-AZ')} AZN`,
          },
        });
      }
    }

    if (inserts.length > 0) {
      await sb.from('notifications').insert(inserts);
    }

    return jsonResponse({ ok: true, inserted: inserts.length });
  } catch (e) {
    return errorResponse(e);
  }
}
