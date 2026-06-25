import { describe, it, expect } from 'vitest';
import {
  formatAZN,
  formatDate,
  relativeTime,
  taskHealth,
  bakuMonthKey,
  bakuCurrentMonthRange,
  bakuToday,
  bakuEndOfWeek,
  bakuDaysUntil,
} from './format';

describe('formatAZN', () => {
  it('returns em-dash for null/undefined', () => {
    expect(formatAZN(null)).toBe('—');
    expect(formatAZN(undefined)).toBe('—');
  });

  it('formats integers with AZN currency and no fraction digits', () => {
    const out = formatAZN(1500);
    // Azerbaijani locale (az-AZ) uses '.' as the thousands separator → "1.500 ₼"
    // Accept any thousands separator (dot, comma, space, narrow-space) or none.
    expect(out).toMatch(/1[.,\s ]?500/);
    expect(out).toMatch(/₼|AZN/i);
  });
});

describe('formatDate', () => {
  it('returns em-dash on missing input', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('formats an ISO date in Asia/Baku', () => {
    const out = formatDate('2026-01-15T00:00:00Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/15/);
  });
});

describe('bakuToday', () => {
  it('matches the UTC date during Baku daytime', () => {
    // 12:00 UTC = 16:00 Baku, same calendar day
    expect(bakuToday(new Date('2026-06-20T12:00:00Z'))).toBe('2026-06-20');
  });

  it('is one day ahead of UTC in the late Baku evening (the off-by-one bug)', () => {
    // 22:00 UTC = 02:00 next day in Baku (UTC+4). A UTC slice would say the 20th.
    expect(bakuToday(new Date('2026-06-20T22:00:00Z'))).toBe('2026-06-21');
  });
});

describe('bakuEndOfWeek', () => {
  it('returns the upcoming Sunday for a midweek date', () => {
    // 2026-06-20 is a Saturday; end of that week (Sunday) is 2026-06-21
    expect(bakuEndOfWeek(new Date('2026-06-18T09:00:00Z'))).toBe('2026-06-21'); // Thu → Sun
  });

  it('returns the same day when it is already Sunday', () => {
    // 2026-06-21 is a Sunday
    expect(bakuEndOfWeek(new Date('2026-06-21T09:00:00Z'))).toBe('2026-06-21');
  });

  it('is never before today', () => {
    const today = bakuToday(new Date('2026-06-18T09:00:00Z'));
    expect(bakuEndOfWeek(new Date('2026-06-18T09:00:00Z')) >= today).toBe(true);
  });
});

describe('bakuDaysUntil', () => {
  it('is 0 for today and counts whole calendar days', () => {
    const now = new Date('2026-06-20T12:00:00Z'); // Baku 16:00, 20th
    expect(bakuDaysUntil('2026-06-20', now)).toBe(0);
    expect(bakuDaysUntil('2026-06-23', now)).toBe(3);
    expect(bakuDaysUntil('2026-06-19', now)).toBe(-1);
  });

  it('does not skew ±1 day in the late Baku evening', () => {
    // 22:00 UTC = 02:00 on the 21st in Baku. A deadline of the 21st is "today".
    const now = new Date('2026-06-20T22:00:00Z');
    expect(bakuDaysUntil('2026-06-21', now)).toBe(0);
    expect(bakuDaysUntil('2026-06-22', now)).toBe(1);
  });

  it('ignores any time component on the input', () => {
    const now = new Date('2026-06-20T12:00:00Z');
    expect(bakuDaysUntil('2026-06-22T18:30:00Z', now)).toBe(2);
  });
});

describe('relativeTime', () => {
  it('handles "just now" within a minute', () => {
    expect(relativeTime(new Date(Date.now() - 30_000).toISOString())).toBe('indi');
  });

  it('reports minutes for under an hour', () => {
    const t = new Date(Date.now() - 12 * 60_000).toISOString();
    expect(relativeTime(t)).toBe('12 dəq əvvəl');
  });

  it('reports hours under 24', () => {
    const t = new Date(Date.now() - 5 * 3600_000).toISOString();
    expect(relativeTime(t)).toBe('5 saat əvvəl');
  });

  it('reports days under a week', () => {
    const t = new Date(Date.now() - 3 * 86400_000).toISOString();
    expect(relativeTime(t)).toBe('3 gün əvvəl');
  });
});

describe('bakuMonthKey (REQ-FIN-09)', () => {
  it('groups a UTC instant by Baku local month', () => {
    // 2026-01-31 22:00 UTC == 2026-02-01 02:00 Asia/Baku → February.
    expect(bakuMonthKey('2026-01-31T22:00:00Z')).toBe('2026-02');
  });

  it('keeps a mid-day UTC instant in the same Baku month', () => {
    expect(bakuMonthKey('2026-03-15T12:00:00Z')).toBe('2026-03');
  });

  it('returns empty string on missing input', () => {
    expect(bakuMonthKey(null)).toBe('');
    expect(bakuMonthKey(undefined)).toBe('');
  });
});

describe('bakuCurrentMonthRange (REQ-FIN-09)', () => {
  it('returns a half-open range one Baku month wide', () => {
    // Pick a fixed reference inside February 2026 in Baku.
    const ref = new Date('2026-02-15T08:00:00Z');
    const { start, end } = bakuCurrentMonthRange(ref);
    expect(start.toISOString()).toBe('2026-01-31T20:00:00.000Z'); // 2026-02-01 00:00 +04:00
    expect(end.toISOString()).toBe('2026-02-28T20:00:00.000Z'); // 2026-03-01 00:00 +04:00
  });

  it('rolls year over from December to January', () => {
    const ref = new Date('2026-12-20T05:00:00Z');
    const { end } = bakuCurrentMonthRange(ref);
    expect(end.toISOString()).toBe('2026-12-31T20:00:00.000Z'); // 2027-01-01 00:00 +04:00
  });
});

describe('taskHealth (REQ-DASH-04)', () => {
  it('returns "none" without a deadline', () => {
    expect(taskHealth(null)).toBe('none');
    expect(taskHealth(undefined)).toBe('none');
  });

  it('returns "red" for overdue or <3d', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(taskHealth(past)).toBe('red');
    const tomorrow = new Date(Date.now() + 1.5 * 86_400_000).toISOString();
    expect(taskHealth(tomorrow)).toBe('red');
  });

  it('returns "amber" between 3 and 14 days', () => {
    const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString();
    expect(taskHealth(in7)).toBe('amber');
  });

  it('returns "green" beyond 14 days', () => {
    const farOut = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect(taskHealth(farOut)).toBe('green');
  });
});
