/**
 * Minimal RFC 5545 .ics builder + recurrence expander.
 * PRD §8.2: external attendees get an .ics; recurring via RFC 5545
 * recurrence_rule; multi-day via starts_at/ends_at.
 *
 * Recurrence support is intentionally narrow (FREQ=DAILY|WEEKLY|MONTHLY +
 * INTERVAL, COUNT, UNTIL). BYDAY / EXDATE / nested rules are out of v1 scope
 * per §11.3 DoD; advanced cases TODO when product calls for them.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  recurrence_rule: string | null;
  location: string | null;
  meet_url: string | null;
  organizer_id: string | null;
  attendees: string[];
  external_emails: string[];
  project_id: string | null;
};

// ---------------------------------------------------------------------------
// .ics serialization
// ---------------------------------------------------------------------------

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function toIcsDate(iso: string, allDay: boolean) {
  const d = new Date(iso);
  if (allDay) {
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate())
    );
  }
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
function escapeIcs(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function buildIcs(event: CalendarEvent, organizerEmail: string | null): string {
  const dtKey = event.all_day ? 'DTSTART;VALUE=DATE' : 'DTSTART';
  const dtEndKey = event.all_day ? 'DTEND;VALUE=DATE' : 'DTEND';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reflect Architects OS//AZ',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.id}@reflect.az`,
    `DTSTAMP:${toIcsDate(new Date().toISOString(), false)}`,
    `${dtKey}:${toIcsDate(event.starts_at, event.all_day)}`,
    `${dtEndKey}:${toIcsDate(event.ends_at, event.all_day)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.meet_url) lines.push(`URL:${escapeIcs(event.meet_url)}`);
  if (event.recurrence_rule) lines.push(`RRULE:${event.recurrence_rule}`);
  if (organizerEmail) lines.push(`ORGANIZER:mailto:${organizerEmail}`);
  for (const email of event.external_emails) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${email}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Recurrence expander — minimal FREQ=DAILY|WEEKLY|MONTHLY
// ---------------------------------------------------------------------------

type Occurrence = { starts_at: Date; ends_at: Date };

export function expandOccurrences(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const duration = end.getTime() - start.getTime();

  if (!event.recurrence_rule) {
    return overlaps(start, end, rangeStart, rangeEnd) ? [{ starts_at: start, ends_at: end }] : [];
  }

  const parts = parseRrule(event.recurrence_rule);
  if (!parts.freq) {
    return overlaps(start, end, rangeStart, rangeEnd) ? [{ starts_at: start, ends_at: end }] : [];
  }

  const out: Occurrence[] = [];
  let count = 0;
  let cursor = new Date(start);
  const limit = parts.until ? parts.until : null;
  const maxCount = parts.count ?? 500; // safety cap
  const interval = parts.interval && parts.interval > 0 ? parts.interval : 1;

  while (count < maxCount) {
    if (limit && cursor.getTime() > limit.getTime()) break;
    if (cursor.getTime() > rangeEnd.getTime()) break;

    const occEnd = new Date(cursor.getTime() + duration);
    if (overlaps(cursor, occEnd, rangeStart, rangeEnd)) {
      out.push({ starts_at: new Date(cursor), ends_at: occEnd });
    }

    cursor = step(cursor, parts.freq, interval);
    count += 1;
  }

  return out;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

function step(d: Date, freq: 'DAILY' | 'WEEKLY' | 'MONTHLY', interval: number): Date {
  const n = new Date(d);
  if (freq === 'DAILY') n.setUTCDate(n.getUTCDate() + interval);
  else if (freq === 'WEEKLY') n.setUTCDate(n.getUTCDate() + 7 * interval);
  else n.setUTCMonth(n.getUTCMonth() + interval);
  return n;
}

type ParsedRrule = {
  freq?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval?: number;
  count?: number;
  until?: Date;
};

function parseRrule(rule: string): ParsedRrule {
  const out: ParsedRrule = {};
  for (const part of rule.split(';')) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    switch (k.toUpperCase()) {
      case 'FREQ':
        if (v === 'DAILY' || v === 'WEEKLY' || v === 'MONTHLY') out.freq = v;
        break;
      case 'INTERVAL':
        out.interval = Number(v);
        break;
      case 'COUNT':
        out.count = Number(v);
        break;
      case 'UNTIL':
        out.until = parseIcsDate(v);
        break;
      // BYDAY etc. ignored in v1; rule still serialized in .ics for clients
      // that support more.
    }
  }
  return out;
}

function parseIcsDate(s: string): Date {
  // 19970714T173000Z or 19970714
  if (s.length === 8) {
    return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
  }
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
  );
}
