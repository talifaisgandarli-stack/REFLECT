import { describe, it, expect } from 'vitest';
import { advance } from './recurring-expenses';

describe('advance() — REQ-FIN-05 period rollover', () => {
  it('weekly adds 7 days', () => {
    const r = advance(new Date('2026-05-01T00:00:00Z'), 'weekly');
    expect(r.toISOString().slice(0, 10)).toBe('2026-05-08');
  });
  it('monthly adds one month', () => {
    const r = advance(new Date('2026-01-15T00:00:00Z'), 'monthly');
    expect(r.toISOString().slice(0, 10)).toBe('2026-02-15');
  });
  it('quarterly adds three months', () => {
    const r = advance(new Date('2026-01-15T00:00:00Z'), 'quarterly');
    expect(r.toISOString().slice(0, 10)).toBe('2026-04-15');
  });
  it('yearly adds one year', () => {
    const r = advance(new Date('2026-03-10T00:00:00Z'), 'yearly');
    expect(r.toISOString().slice(0, 10)).toBe('2027-03-10');
  });
  it('rolls month-end correctly (Jan 31 → Mar 03 in non-leap)', () => {
    const r = advance(new Date('2025-01-31T00:00:00Z'), 'monthly');
    // Date setUTCMonth normalizes overflow — Feb 31 → Mar 03 (2025 not leap).
    expect(r.toISOString().slice(0, 10)).toBe('2025-03-03');
  });
});
