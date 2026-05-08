import { describe, it, expect } from 'vitest';
import { formatAZN, formatDate, relativeTime, taskHealth } from './format';

describe('formatAZN', () => {
  it('returns em-dash for null/undefined', () => {
    expect(formatAZN(null)).toBe('—');
    expect(formatAZN(undefined)).toBe('—');
  });

  it('formats integers with AZN currency and no fraction digits', () => {
    const out = formatAZN(1500);
    expect(out).toMatch(/1\s?500/);
    expect(out.toLowerCase()).toMatch(/azn|man/);
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
