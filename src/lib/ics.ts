/**
 * Minimal RFC 5545 .ics generator (PRD §8.2 — v1 .ics + mailto path,
 * v2 swaps for Google OAuth). Only the fields we use are emitted; the
 * goal is "Mail.app / Outlook / Gmail accept this drag-or-attach".
 */

type IcsEvent = {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string; // ISO
  ends_at: string; // ISO
  all_day?: boolean;
  location?: string | null;
  meet_url?: string | null;
  attendees?: string[];
  external_emails?: string[];
};

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function fmtUTC(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function buildIcs(ev: IcsEvent): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reflect Architects OS//AZ//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}@reflect.studio`,
    `DTSTAMP:${fmtUTC(new Date().toISOString())}`,
  ];
  if (ev.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.starts_at)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(ev.ends_at)}`);
  } else {
    lines.push(`DTSTART:${fmtUTC(ev.starts_at)}`);
    lines.push(`DTEND:${fmtUTC(ev.ends_at)}`);
  }
  lines.push(`SUMMARY:${escape(ev.title)}`);
  const desc = [ev.description ?? '', ev.meet_url ? `\nGörüş linki: ${ev.meet_url}` : '']
    .filter(Boolean)
    .join('');
  if (desc) lines.push(`DESCRIPTION:${escape(desc)}`);
  if (ev.location) lines.push(`LOCATION:${escape(ev.location)}`);
  for (const e of ev.external_emails ?? []) {
    lines.push(`ATTENDEE;CN="${escape(e)}";RSVP=TRUE:mailto:${e}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildMailtoInvite(
  ev: IcsEvent,
  recipients: string[],
): string {
  const params = new URLSearchParams();
  params.set('subject', `[Reflect] ${ev.title}`);
  const body =
    [
      ev.description ?? '',
      '',
      `Vaxt: ${new Date(ev.starts_at).toISOString()}`,
      ev.location ? `Yer: ${ev.location}` : '',
      ev.meet_url ? `Görüş linki: ${ev.meet_url}` : '',
      '',
      'İcs faylı əlavə olunub — təqviminə əlavə et.',
    ]
      .filter(Boolean)
      .join('\n');
  params.set('body', body);
  return `mailto:${recipients.join(',')}?${params.toString()}`;
}
