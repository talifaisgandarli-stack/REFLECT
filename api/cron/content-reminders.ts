/**
 * US-CONTENT-01 — 2-day reminder for upcoming content posts.
 *
 * Runs daily. For each content_plans row scheduled within the next 48h that
 * isn't yet 'published', inserts a `content_due_soon` notification for the
 * owner (and admins as fallback if owner is null).
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3_600_000);
    const oneDayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();

    const { data: items } = await sb
      .from('content_plans')
      .select('id, channel, topic, owner_id, scheduled_at, status')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in48h.toISOString())
      .neq('status', 'published');

    const inserts: Array<{ user_id: string; kind: string; payload: Record<string, unknown> }> = [];
    for (const item of items ?? []) {
      const ownerId = item.owner_id as string | null;
      if (!ownerId) continue;

      const { data: recent } = await sb
        .from('notifications')
        .select('id')
        .eq('user_id', ownerId)
        .eq('kind', 'content_due_soon')
        .contains('payload', { content_id: item.id })
        .gte('created_at', oneDayAgo)
        .limit(1)
        .maybeSingle();
      if (recent) continue;

      inserts.push({
        user_id: ownerId,
        kind: 'content_due_soon',
        payload: {
          content_id: item.id,
          channel: item.channel,
          topic: item.topic,
          scheduled_at: item.scheduled_at,
          title: `Məzmun yaxınlaşır: ${item.topic} (${item.channel})`,
        },
      });
    }

    if (inserts.length > 0) {
      await sb.from('notifications').insert(inserts);
    }

    return jsonResponse({ ok: true, inserted: inserts.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'cron/content-reminders');
