/**
 * Calendar email invite — PRD §8.2 + US-CAL-01.
 * POST /api/calendar/invite  { event_id }
 *
 * Builds an .ics from the event row and emails it to every external attendee
 * via Resend. Internal in-app notifications are written by the client-side
 * mutation; Telegram fan-out is out of scope here.
 *
 * No-op (returns ok=true) when RESEND_API_KEY is unset, so local dev does not
 * fail.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { buildIcs, type CalendarEvent } from '../../src/lib/ics';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);

    const { event_id } = (await req.json()) as { event_id?: string };
    if (!event_id) throw new HttpError(400, 'event_id required');

    const sb = admin();
    const { data: event, error } = await sb
      .from('calendar_events')
      .select('*')
      .eq('id', event_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!event) throw new HttpError(404, 'Hadisə tapılmadı');

    // Only the organizer or an admin can fire invites.
    if (event.organizer_id && event.organizer_id !== user.id && !user.isAdmin) {
      throw new HttpError(403, 'Yalnız təşkilatçı və ya admin');
    }

    const externals: string[] = event.external_emails ?? [];
    if (externals.length === 0) return jsonResponse({ ok: true, sent: 0 });

    const ics = buildIcs(event as CalendarEvent, user.email);

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return jsonResponse({ ok: true, sent: 0, note: 'RESEND_API_KEY missing' });

    const html = `<p>${escapeHtml(event.title)}</p>` +
      (event.description ? `<p>${escapeHtml(event.description)}</p>` : '') +
      `<p>${new Date(event.starts_at).toUTCString()} → ${new Date(event.ends_at).toUTCString()}</p>` +
      (event.meet_url ? `<p><a href="${event.meet_url}">Görüşə qoşul</a></p>` : '');

    const mailto =
      `mailto:?subject=${encodeURIComponent(event.title)}` +
      `&body=${encodeURIComponent(`${event.title}\n${event.starts_at}\n${event.meet_url ?? ''}`)}`;

    let sent = 0;
    for (const to of externals) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Reflect <noreply@reflect.az>',
          to,
          subject: event.title,
          html: html + `<p><a href="${mailto}">Email-də aç</a></p>`,
          attachments: [
            {
              filename: 'invite.ics',
              content: btoa(unescape(encodeURIComponent(ics))),
              content_type: 'text/calendar; method=REQUEST; charset=UTF-8',
            },
          ],
        }),
      }).catch(() => null);
      if (res && res.ok) sent += 1;
    }

    return jsonResponse({ ok: true, sent });
  } catch (e) {
    return errorResponse(e);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
