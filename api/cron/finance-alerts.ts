/**
 * Finance threshold alerts cron (PRD §8.1).
 *
 * Watches three signals and inserts finance_alert notifications for
 * admin profiles only (notify-fanout dispatch then routes them to
 * email + Telegram per the per-channel preference matrix):
 *
 *   1. Income > X AZN in the last 24h (default 5_000)
 *   2. Expense > Y AZN in the last 24h (default 5_000)
 *   3. Receivable past due_at + status != paid (any age)
 *
 * Thresholds live in `system_settings`:
 *   key='finance.alert.income_threshold' value={"v": 5000}
 *   key='finance.alert.expense_threshold' value={"v": 5000}
 *
 * Idempotent: a row whose payload.key matches an entry in the previous
 * 24h skip-list is skipped, so the same income spike doesn't dispatch
 * twice when the cron runs hourly.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type Setting = { value: { v: number } | null };

const DEFAULT_INCOME_THRESHOLD = 5_000;
const DEFAULT_EXPENSE_THRESHOLD = 5_000;

async function readThreshold(
  sb: ReturnType<typeof admin>,
  key: string,
  fallback: number,
): Promise<number> {
  const { data } = await sb.from('system_settings').select('value').eq('key', key).maybeSingle();
  const v = (data as Setting | null)?.value?.v;
  return typeof v === 'number' && v > 0 ? v : fallback;
}

async function adminUserIds(sb: ReturnType<typeof admin>): Promise<string[]> {
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, is_creator, role_id')
    .eq('is_active', true);
  if (!profiles) return [];
  const roleIds = Array.from(
    new Set(profiles.map((p) => p.role_id).filter(Boolean) as string[]),
  );
  const adminRoles = new Set<string>();
  if (roleIds.length > 0) {
    const { data: roles } = await sb.from('roles').select('id, is_admin').in('id', roleIds);
    for (const r of roles ?? []) {
      if ((r as { is_admin: boolean }).is_admin) adminRoles.add((r as { id: string }).id);
    }
  }
  return profiles
    .filter(
      (p) =>
        (p as { is_creator: boolean }).is_creator ||
        ((p as { role_id: string | null }).role_id != null &&
          adminRoles.has((p as { role_id: string }).role_id!)),
    )
    .map((p) => (p as { id: string }).id);
}

async function alreadySent(
  sb: ReturnType<typeof admin>,
  userId: string,
  key: string,
  windowHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const { count } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'finance_alert')
    .gte('created_at', since)
    .filter('payload->>key', 'eq', key);
  return (count ?? 0) > 0;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [incomeThreshold, expenseThreshold, admins] = await Promise.all([
      readThreshold(sb, 'finance.alert.income_threshold', DEFAULT_INCOME_THRESHOLD),
      readThreshold(sb, 'finance.alert.expense_threshold', DEFAULT_EXPENSE_THRESHOLD),
      adminUserIds(sb),
    ]);
    if (admins.length === 0) {
      return jsonResponse({ ok: true, inserted: 0, note: 'no admins' });
    }

    const [bigIncomes, bigExpenses, overdue] = await Promise.all([
      sb
        .from('incomes')
        .select('id, amount, occurred_at')
        .gte('occurred_at', since)
        .gte('amount', incomeThreshold),
      sb
        .from('expenses')
        .select('id, amount, occurred_at')
        .gte('occurred_at', since)
        .gte('amount', expenseThreshold),
      sb
        .from('receivables')
        .select('id, amount, paid_amount, due_at, status, client_id')
        .neq('status', 'paid')
        .lt('due_at', new Date().toISOString().slice(0, 10)),
    ]);

    const events: Array<{ key: string; payload: Record<string, unknown> }> = [];
    for (const r of bigIncomes.data ?? []) {
      const row = r as { id: string; amount: number };
      events.push({
        key: `income:${row.id}`,
        payload: {
          key: `income:${row.id}`,
          kind: 'large_income',
          amount: Number(row.amount),
          title: `Böyük gəlir: ${Number(row.amount)} AZN`,
        },
      });
    }
    for (const r of bigExpenses.data ?? []) {
      const row = r as { id: string; amount: number };
      events.push({
        key: `expense:${row.id}`,
        payload: {
          key: `expense:${row.id}`,
          kind: 'large_expense',
          amount: Number(row.amount),
          title: `Böyük xərc: ${Number(row.amount)} AZN`,
        },
      });
    }
    for (const r of overdue.data ?? []) {
      const row = r as {
        id: string;
        amount: number;
        paid_amount: number;
        due_at: string;
      };
      const remaining = Number(row.amount) - Number(row.paid_amount);
      events.push({
        key: `overdue:${row.id}`,
        payload: {
          key: `overdue:${row.id}`,
          kind: 'overdue_receivable',
          amount: remaining,
          due_at: row.due_at,
          title: `Gecikmiş debitor: ${remaining} AZN (${row.due_at})`,
        },
      });
    }

    let inserted = 0;
    for (const ev of events) {
      for (const uid of admins) {
        if (await alreadySent(sb, uid, ev.key, 24)) continue;
        const { error } = await sb.from('notifications').insert({
          user_id: uid,
          kind: 'finance_alert',
          payload: ev.payload,
        });
        if (!error) inserted += 1;
      }
    }

    return jsonResponse({
      ok: true,
      events: events.length,
      admins: admins.length,
      inserted,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
