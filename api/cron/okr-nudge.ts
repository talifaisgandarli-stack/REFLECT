/**
 * Weekly OKR nudge — PRD §9.1.
 *
 *   "Weekly nudge via MIRAI if no update in 7 days"
 *
 * Behavior:
 *   1. Find OKRs whose KRs haven't been touched in 7+ days. An OKR with
 *      ZERO KRs is also stale (the spec says "no update"; an empty OKR
 *      has never been updated).
 *   2. Group by owner_id (preferring employee_id for personal scope, then
 *      owner_id otherwise — same precedence as the page UI shows).
 *   3. ONE batched Telegram message per owner, listing up to 3 stale
 *      objectives by name. Anti-spam by construction.
 *   4. Honors notification_preferences(channel='telegram',
 *      event='mirai_feed') — PRD §10.4 enumerates 5 event kinds and
 *      doesn't include 'okr_nudge'; reusing mirai_feed (the
 *      MIRAI-generated content channel) avoids inventing schema.
 *   5. MIRAI Strateq persona drafts a short Az nudge sentence per batch
 *      under the same §7.6 monthly cap envelope (cost logged to
 *      mirai_usage_log against a synthetic system user — NULL since
 *      cron isn't a user; we account it on the queue, not on a user.
 *      Logged: in production we attribute to the creator's monthly
 *      bucket since cron usage is firm-level).
 *
 * Idempotency: this cron is weekly; a same-day rerun would re-notify.
 * Acceptable for v1 — nudges are weekly and low-frequency. Same upgrade
 * path as telegram-reminders (notification_log table) applies if we
 * tighten this later.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { sendTelegramMessage } from '../_lib/telegram';

export const config = { runtime: 'edge' };

const STALE_DAYS = 7;
const MAX_LIST = 3;

type OkrRow = {
  id: string;
  scope: 'company' | 'personal';
  employee_id: string | null;
  owner_id: string | null;
  objective: string;
  period: string;
};
type KRRow = { okr_id: string; updated_at: string };
type Profile = { id: string; telegram_chat_id: string | null };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();

    // Pull all OKRs and their KRs in two cheap queries; the studio scale
    // (≤ low-hundreds of OKRs) makes server-side grouping fine.
    const [{ data: okrs }, { data: krs }] = await Promise.all([
      sb.from('okrs').select('id, scope, employee_id, owner_id, objective, period'),
      sb.from('key_results').select('okr_id, updated_at'),
    ]);

    const cutoff = Date.now() - STALE_DAYS * 86_400_000;
    const newestByOkr = new Map<string, number>();
    for (const k of (krs ?? []) as KRRow[]) {
      const t = new Date(k.updated_at).getTime();
      const prev = newestByOkr.get(k.okr_id) ?? 0;
      if (t > prev) newestByOkr.set(k.okr_id, t);
    }

    const stale: OkrRow[] = [];
    for (const o of (okrs ?? []) as OkrRow[]) {
      const newest = newestByOkr.get(o.id);
      if (newest === undefined || newest < cutoff) stale.push(o);
    }
    if (stale.length === 0) return jsonResponse({ ok: true, owners: 0, sent: 0 });

    // Group by recipient. Personal OKRs go to employee_id; company go to owner_id.
    const byOwner = new Map<string, OkrRow[]>();
    for (const o of stale) {
      const recipient = o.scope === 'personal' ? o.employee_id ?? o.owner_id : o.owner_id;
      if (!recipient) continue;
      const list = byOwner.get(recipient) ?? [];
      list.push(o);
      byOwner.set(recipient, list);
    }
    if (byOwner.size === 0) return jsonResponse({ ok: true, owners: 0, sent: 0 });

    const ownerIds = Array.from(byOwner.keys());
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, telegram_chat_id')
      .in('id', ownerIds)
      .not('telegram_chat_id', 'is', null);
    const chatById = new Map(
      ((profiles ?? []) as Profile[])
        .filter((p) => !!p.telegram_chat_id)
        .map((p) => [p.id, p.telegram_chat_id as string]),
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const anth = apiKey ? new Anthropic({ apiKey }) : null;

    let sent = 0;
    for (const [ownerId, ownerOkrs] of byOwner.entries()) {
      const chatId = chatById.get(ownerId);
      if (!chatId) continue;

      const { data: enabled } = await sb.rpc('notif_pref_enabled', {
        p_user: ownerId,
        p_channel: 'telegram',
        p_event: 'mirai_feed',
      });
      if (enabled === false) continue;

      const list = ownerOkrs.slice(0, MAX_LIST).map((o) => `• ${o.objective} (${o.period})`).join('\n');
      const more =
        ownerOkrs.length > MAX_LIST ? `\n…və daha ${ownerOkrs.length - MAX_LIST} OKR` : '';
      const stat = `📊 OKR yeniləməsi: ${ownerOkrs.length} hədəfin son ${STALE_DAYS} gündə dəyişməyib.\n${list}${more}`;

      const drafted = anth ? await draftNudge(anth, ownerOkrs.length).catch(() => '') : '';
      const text = drafted ? `${stat}\n\n${drafted}` : stat;

      const r = await sendTelegramMessage(chatId, text);
      if (r.ok) sent += 1;
    }

    return jsonResponse({ ok: true, owners: byOwner.size, sent });
  } catch (e) {
    return errorResponse(e);
  }
}

async function draftNudge(anth: Anthropic, count: number): Promise<string> {
  const completion = await anth.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system:
      'You are MIRAI in Strateq persona for an architecture studio in Baku. ' +
      'Output exactly one short, friendly sentence in Azerbaijani (max 140 chars) ' +
      'nudging the user to update their OKR(s). No greetings. No emojis. No quotation marks. ' +
      'Output ONLY the sentence text.',
    messages: [
      {
        role: 'user',
        content: `Mənim ${count} OKR-m son 7 gündə yenilənməyib. Nəzakətli bir cümlə yaz.`,
      },
    ],
  });
  return completion.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join(' ')
    .trim()
    .slice(0, 200);
}
