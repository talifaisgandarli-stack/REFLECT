/**
 * MIRAI cost guardian status — PRD §7.6.
 * Returns the caller's current-month spend, the configured monthly cap, and
 * a derived warning level (none / warning / blocked). UI uses this to render
 * the banner + disabled state.
 *
 * GET /api/mirai/usage
 */
import { admin, errorResponse, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MONTHLY_CAP = Number(process.env.MIRAI_MONTHLY_CAP_USD ?? '20');

export default async function handler(req: Request) {
  try {
    const user = await requireUser(req);
    const sb = admin();

    const period = new Date();
    const yyyymm = period.getUTCFullYear() * 100 + (period.getUTCMonth() + 1);

    const { data } = await sb
      .from('mirai_usage_log')
      .select('cost_usd, tokens_in, tokens_out')
      .eq('user_id', user.id)
      .eq('period_yyyymm', yyyymm)
      .maybeSingle();

    const spent = Number(data?.cost_usd ?? 0);
    const ratio = MONTHLY_CAP > 0 ? spent / MONTHLY_CAP : 0;
    let level: 'none' | 'warning' | 'blocked' = 'none';
    if (ratio >= 1) level = 'blocked';
    else if (ratio >= 0.8) level = 'warning';

    return jsonResponse({
      cap_usd: MONTHLY_CAP,
      spent_usd: spent,
      ratio,
      level,
      tokens_in: data?.tokens_in ?? 0,
      tokens_out: data?.tokens_out ?? 0,
      period_yyyymm: yyyymm,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
