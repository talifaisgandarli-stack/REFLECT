/**
 * Meeting reminder cron (PRD §8.2).
 *
 * Runs every 5 minutes. Finds calendar_events starting in ~30 or ~10 minutes
 * (with a 5-min look-ahead window so each event hits exactly one bucket per
 * cron tick) and fan-outs a notification to every attendee.
 *
 * Idempotency: writes a per-(event,attendee,bucket) marker into
 * notifications.payload.meeting_reminder so re-runs don't duplicate.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

const REMINDER_BUCKETS = [
  { minutes: 30, label: '30 dəq' },
  { minutes: 10, label: '10 dəq' },
];

const WINDOW_MS = 5 * 60 * 1000; // 5-min cron cadence

async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    const now = Date.now();
    let emitted = 0;

    for (const bucket of REMINDER_BUCKETS) {
      const targetStart = new Date(now + bucket.minutes * 60_000).toISOString();
      const targetEnd = new Date(now + bucket.minutes * 60_000 + WINDOW_MS).toISOString();

      const { data: events } = await sb
        .from('calendar_events')
        .select('id, title, starts_at, attendees, external_emails, location, meet_url')
        .gte('starts_at', targetStart)
        .lt('starts_at', targetEnd);

      for (const ev of events ?? []) {
        const attendees: string[] = (ev.attendees as string[] | null) ?? [];
        if (attendees.length === 0) continue;

        // Check existing reminders for this (event, bucket) to dedupe
        const { data: existing } = await sb
          .from('notifications')
          .select('user_id')
          .eq('kind', 'meeting_reminder')
          .filter('payload->>event_id', 'eq', ev.id)
          .filter('payload->>bucket', 'eq', String(bucket.minutes));
        const dispatched = new Set(((existing ?? []) as Array<{ user_id: string }>).map((e) => e.user_id));

        const fresh = attendees.filter((uid) => !dispatched.has(uid));
        if (fresh.length === 0) continue;

        const rows = fresh.map((uid) => ({
          user_id: uid,
          kind: 'meeting_reminder',
          payload: {
            event_id: ev.id,
            bucket: String(bucket.minutes),
            title: `${ev.title} (${bucket.label} sonra)`,
            starts_at: ev.starts_at,
            location: ev.location,
            meet_url: ev.meet_url,
          },
          dispatched_channels: {},
        }));

        for (let i = 0; i < rows.length; i += 50) {
          await sb.from('notifications').insert(rows.slice(i, i + 50));
        }
        emitted += rows.length;
      }
    }

    return jsonResponse({ ok: true, emitted });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'cron/meeting-reminders');
