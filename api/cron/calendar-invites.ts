/**
 * Calendar invite dispatcher — US-CAL-01.
 * For every calendar_events row with external_emails ≠ {} and invite_sent_at
 * IS NULL, generates an RFC 5545 .ics body and sends it via Resend (one email
 * per external recipient with the .ics attached). Stamps invite_sent_at so
 * retries are idempotent.
 *
 * Auth: x-vercel-cron OR ?key=<CRON_SECRET>.
 * Env: RESEND_API_KEY, RESEND_FROM (optional).
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const BATCH = 50;
const RESEND_FROM = process.env.RESEND_FROM ?? 'Reflect <notify@reflect.local>';

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  meet_url: string | null;
  external_emails: string[];
};

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' ||
      url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const RESEND = process.env.RESEND_API_KEY;
    if (!RESEND) {
      return jsonResponse({ ok: true, skipped: 'RESEND_API_KEY missing' });
    }

    const sb = admin();
    const { data: events, error } = await sb
      .from('calendar_events')
      .select(
        'id, title, description, starts_at, ends_at, all_day, location, meet_url, external_emails',
      )
      .is('invite_sent_at', null)
      .gt('starts_at', new Date().toISOString())
      .limit(BATCH);
    if (error) throw error;

    const pending = (events ?? []).filter(
      (e) => Array.isArray(e.external_emails) && e.external_emails.length > 0,
    ) as EventRow[];
    if (pending.length === 0) return jsonResponse({ ok: true, sent: 0 });

    let sent = 0;
    const dispatched: string[] = [];

    for (const evt of pending) {
      const ics = buildIcs(evt);
      const subject = evt.title;
      const text = bodyText(evt);
      let allOk = true;

      for (const to of evt.external_emails) {
        const ok = await sendIcsEmail(RESEND, to, subject, text, ics, evt.id).catch(
          () => false,
        );
        if (!ok) allOk = false;
        else sent++;
      }

      // Mark dispatched even if some recipients failed — we don't want a single
      // bad address to keep retrying the whole batch. Operators can re-trigger
      // by clearing invite_sent_at manually.
      dispatched.push(evt.id);
      if (!allOk) {
        // eslint-disable-next-line no-console
        console.warn(`[calendar-invites] partial failure for event ${evt.id}`);
      }
    }

    if (dispatched.length > 0) {
      const { error: uErr } = await sb
        .from('calendar_events')
        .update({ invite_sent_at: new Date().toISOString() })
        .in('id', dispatched);
      if (uErr) throw uErr;
    }

    return jsonResponse({ ok: true, processed: pending.length, sent });
  } catch (e) {
    return errorResponse(e);
  }
}

function bodyText(evt: EventRow): string {
  const lines: string[] = [];
  lines.push(`Görüş: ${evt.title}`);
  lines.push(`Vaxt: ${evt.starts_at} – ${evt.ends_at}`);
  if (evt.location) lines.push(`Yer: ${evt.location}`);
  if (evt.meet_url) lines.push(`Meet: ${evt.meet_url}`);
  if (evt.description) lines.push('', evt.description);
  return lines.join('\n');
}

function buildIcs(evt: EventRow): string {
  const dtStart = formatIcsDate(evt.starts_at, evt.all_day);
  const dtEnd = formatIcsDate(evt.ends_at, evt.all_day);
  const dtStamp = formatIcsDate(new Date().toISOString(), false);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reflect//Calendar//AZ',
    'METHOD:REQUEST',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${evt.id}@reflect`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART${evt.all_day ? ';VALUE=DATE' : ''}:${dtStart}`,
    `DTEND${evt.all_day ? ';VALUE=DATE' : ''}:${dtEnd}`,
    `SUMMARY:${escapeIcs(evt.title)}`,
  ];
  if (evt.location) lines.push(`LOCATION:${escapeIcs(evt.location)}`);
  if (evt.description || evt.meet_url) {
    const desc =
      (evt.description ?? '') +
      (evt.meet_url ? `\\nMeet: ${evt.meet_url}` : '');
    lines.push(`DESCRIPTION:${escapeIcs(desc)}`);
  }
  if (evt.meet_url) lines.push(`URL:${evt.meet_url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function formatIcsDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
  // UTC stamp e.g. 20260508T130000Z
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

async function sendIcsEmail(
  apiKey: string,
  to: string,
  subject: string,
  text: string,
  icsBody: string,
  eventId: string,
): Promise<boolean> {
  const attachment = btoa(unescape(encodeURIComponent(icsBody)));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      text,
      attachments: [
        {
          filename: `event-${eventId}.ics`,
          content: attachment,
          content_type: 'text/calendar; method=REQUEST; charset=UTF-8',
        },
      ],
    }),
  });
  return res.ok;
}
