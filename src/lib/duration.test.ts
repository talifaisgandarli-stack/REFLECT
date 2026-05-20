import { describe, it, expect } from 'vitest';
import {
  normalizeDurationUnit,
  durationToHours,
  formatEstimatedDuration,
} from './duration';

describe('normalizeDurationUnit', () => {
  it('treats plural and singular forms identically', () => {
    expect(normalizeDurationUnit('days')).toBe('day');
    expect(normalizeDurationUnit('day')).toBe('day');
    expect(normalizeDurationUnit('weeks')).toBe('week');
    expect(normalizeDurationUnit('week')).toBe('week');
    expect(normalizeDurationUnit('hours')).toBe('hour');
    expect(normalizeDurationUnit('hour')).toBe('hour');
  });

  it('defaults to hour for null / undefined / empty / unknown', () => {
    expect(normalizeDurationUnit(null)).toBe('hour');
    expect(normalizeDurationUnit(undefined)).toBe('hour');
    expect(normalizeDurationUnit('')).toBe('hour');
    expect(normalizeDurationUnit('months')).toBe('hour');
    expect(normalizeDurationUnit('   ')).toBe('hour'); // trims-no-trim handled by lowercase only
  });

  it('is case-insensitive', () => {
    expect(normalizeDurationUnit('Days')).toBe('day');
    expect(normalizeDurationUnit('WEEK')).toBe('week');
    expect(normalizeDurationUnit('HoUrS')).toBe('hour');
  });
});

describe('durationToHours', () => {
  it('treats hours as identity', () => {
    expect(durationToHours(5, 'hours')).toBe(5);
    expect(durationToHours(5, 'hour')).toBe(5);
    expect(durationToHours(0, 'hours')).toBe(0);
  });

  it('scales days by the architects-workday constant (8)', () => {
    expect(durationToHours(5, 'days')).toBe(40);
    expect(durationToHours(1, 'day')).toBe(8);
  });

  it('scales weeks by the standard workweek constant (40)', () => {
    expect(durationToHours(2, 'weeks')).toBe(80);
    expect(durationToHours(1, 'week')).toBe(40);
  });

  it('defaults to hours for unknown / null units', () => {
    expect(durationToHours(3, null)).toBe(3);
    expect(durationToHours(3, 'months')).toBe(3);
    expect(durationToHours(3, undefined)).toBe(3);
  });

  it('regression: pre-fix B2 treated "days" as hours — verify it no longer does', () => {
    // The modal writes "days" (plural); a bug in Tasks.tsx checked === 'day'
    // (singular) and fell through to the hour branch. 5 days now correctly
    // resolves to 40 hours, not 5.
    expect(durationToHours(5, 'days')).toBe(40);
    expect(durationToHours(5, 'days')).not.toBe(5);
  });
});

describe('formatEstimatedDuration', () => {
  it('uses the Azerbaijani suffix per normalized unit', () => {
    expect(formatEstimatedDuration(8, 'hours')).toBe('8s');
    expect(formatEstimatedDuration(3, 'days')).toBe('3g');
    expect(formatEstimatedDuration(2, 'weeks')).toBe('2h');
  });

  it('returns null when duration is null (no estimate set)', () => {
    expect(formatEstimatedDuration(null, 'hours')).toBe(null);
    expect(formatEstimatedDuration(null, null)).toBe(null);
  });

  it('handles legacy singular units too', () => {
    expect(formatEstimatedDuration(5, 'day')).toBe('5g');
    expect(formatEstimatedDuration(1, 'week')).toBe('1h');
  });

  it('treats unknown unit as hour (suffix "s")', () => {
    expect(formatEstimatedDuration(2, 'months')).toBe('2s');
    expect(formatEstimatedDuration(2, null)).toBe('2s');
  });
});
