import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  todayInBaku,
  endOfWeekInBaku,
  daysFromTodayInBaku,
  currentMonthInBaku,
} from './time';

/**
 * Bakı is UTC+4 with no DST. Lock Date.now() to specific UTC instants and
 * verify the helpers report the wall-clock-in-Bakı date, not the UTC date.
 * Global setup (src/test/setup.ts) already enables fake timers, so we just
 * override the system time per test and restore on teardown.
 */
function mockNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

afterAll(() => {
  vi.useRealTimers();
});

describe('todayInBaku', () => {
  it('returns Bakı date when UTC is mid-afternoon (no wrap)', () => {
    mockNow('2026-05-20T12:00:00Z'); // 16:00 in Bakı
    expect(todayInBaku()).toBe('2026-05-20');
  });

  it('returns the next Bakı date during the 4-hour UTC tail of the day', () => {
    mockNow('2026-05-20T22:00:00Z'); // 02:00 next day in Bakı
    expect(todayInBaku()).toBe('2026-05-21');
  });

  it('returns the Bakı date at exactly UTC midnight', () => {
    mockNow('2026-05-20T00:00:00Z'); // 04:00 same day in Bakı
    expect(todayInBaku()).toBe('2026-05-20');
  });

  it('handles month rollover correctly in Bakı time', () => {
    mockNow('2026-04-30T23:00:00Z'); // 03:00 May 1 in Bakı
    expect(todayInBaku()).toBe('2026-05-01');
  });
});

describe('endOfWeekInBaku', () => {
  it('returns the same day if Bakı today is Sunday', () => {
    // 2026-05-24 is a Sunday. 12:00 UTC = 16:00 Bakı, still Sunday.
    mockNow('2026-05-24T12:00:00Z');
    expect(endOfWeekInBaku()).toBe('2026-05-24');
  });

  it('returns the upcoming Sunday for a midweek Bakı day', () => {
    // 2026-05-20 is a Wednesday in Bakı.
    mockNow('2026-05-20T12:00:00Z');
    expect(endOfWeekInBaku()).toBe('2026-05-24');
  });

  it('rolls forward when the 22:00-UTC tail puts Bakı on Sunday already', () => {
    // 2026-05-23 22:00 UTC = 2026-05-24 02:00 Bakı (Sunday)
    mockNow('2026-05-23T22:00:00Z');
    expect(endOfWeekInBaku()).toBe('2026-05-24');
  });
});

describe('daysFromTodayInBaku', () => {
  it('shifts forward by N days from Bakı today', () => {
    mockNow('2026-05-20T12:00:00Z');
    expect(daysFromTodayInBaku(7)).toBe('2026-05-27');
  });

  it('shifts backward by N days from Bakı today', () => {
    mockNow('2026-05-20T12:00:00Z');
    expect(daysFromTodayInBaku(-7)).toBe('2026-05-13');
  });

  it('respects the Bakı boundary when computing offsets', () => {
    // 22:00 UTC = 02:00 Bakı next day. -7 from "next day" lands on the day
    // after UTC's -7, not on UTC's -7 itself.
    mockNow('2026-05-20T22:00:00Z'); // Bakı today = 2026-05-21
    expect(daysFromTodayInBaku(-7)).toBe('2026-05-14');
  });
});

describe('currentMonthInBaku', () => {
  it('returns the Bakı month/year, not the UTC one', () => {
    // 31 Dec 2026 22:00 UTC = 1 Jan 2027 02:00 Bakı → month must be January.
    mockNow('2026-12-31T22:00:00Z');
    expect(currentMonthInBaku()).toEqual({ year: 2027, month: 0 });
  });

  it('returns the same month inside the day', () => {
    mockNow('2026-05-20T12:00:00Z');
    expect(currentMonthInBaku()).toEqual({ year: 2026, month: 4 });
  });
});
