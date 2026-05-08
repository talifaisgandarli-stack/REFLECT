import { describe, expect, it } from 'vitest';
import { buildIcs, buildMailtoInvite } from './ics';

const baseEvent = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'Aksent görüşü',
  description: 'TŞ təqdimatı',
  starts_at: '2026-06-15T10:00:00Z',
  ends_at: '2026-06-15T11:00:00Z',
  location: 'Yasamal ofis',
  meet_url: 'https://meet.google.com/abc-defg-hij',
  external_emails: ['client@aksent.az'],
};

describe('buildIcs', () => {
  it('emits a minimal RFC 5545 VCALENDAR envelope', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR$/);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('uses CRLF separators', () => {
    expect(buildIcs(baseEvent).split('\r\n').length).toBeGreaterThan(8);
  });

  it('includes UID + DTSTAMP + DTSTART + DTEND with UTC z-suffix', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain(`UID:${baseEvent.id}@reflect.studio`);
    expect(ics).toContain('DTSTART:20260615T100000Z');
    expect(ics).toContain('DTEND:20260615T110000Z');
  });

  it('renders DTSTART/DTEND as VALUE=DATE for all-day', () => {
    const ics = buildIcs({ ...baseEvent, all_day: true });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615');
    expect(ics).toContain('DTEND;VALUE=DATE:20260615');
  });

  it('appends an ATTENDEE row per external email', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain('ATTENDEE;CN="client@aksent.az";RSVP=TRUE:mailto:client@aksent.az');
  });

  it('includes the meet link inside DESCRIPTION', () => {
    expect(buildIcs(baseEvent)).toContain('Görüş linki: https://meet.google.com/abc-defg-hij');
  });

  it('escapes commas, semicolons, backslashes in summary/description', () => {
    const ics = buildIcs({
      ...baseEvent,
      title: 'A, B; C\\D',
      description: 'note\nwith newline',
    });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D');
    expect(ics).toContain('DESCRIPTION:note\\nwith newline');
  });
});

describe('buildMailtoInvite', () => {
  it('creates a mailto link with subject + body params', () => {
    const url = buildMailtoInvite(baseEvent, ['a@b.az', 'c@d.az']);
    expect(url.startsWith('mailto:a@b.az,c@d.az?')).toBe(true);
    expect(url).toContain('subject=');
    expect(url).toContain('body=');
    expect(decodeURIComponent(url)).toContain('Reflect');
    expect(decodeURIComponent(url)).toContain('Aksent');
  });
});
