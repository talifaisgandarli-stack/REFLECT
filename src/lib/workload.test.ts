import { describe, expect, it } from 'vitest';
import { EXPERTISE_SUBTASKS, computeWorkload } from './workload';

describe('computeWorkload (REQ-TASK-06)', () => {
  it('returns null for missing or non-positive duration', () => {
    expect(computeWorkload(null, 0)).toBe(null);
    expect(computeWorkload(undefined, 10)).toBe(null);
    expect(computeWorkload(0, 20)).toBe(null);
    expect(computeWorkload(-3, 10)).toBe(null);
    expect(computeWorkload(NaN, 10)).toBe(null);
  });

  it('returns the duration unchanged when buffer is 0', () => {
    expect(computeWorkload(8, 0)).toBe(8);
  });

  it('applies a 25% buffer to the duration', () => {
    expect(computeWorkload(8, 25)).toBe(10);
  });

  it('rounds to 2 decimal places', () => {
    expect(computeWorkload(7, 33)).toBe(9.31);
  });

  it('clamps the buffer between 0 and 100', () => {
    expect(computeWorkload(10, -50)).toBe(10); // negatives clamp to 0
    expect(computeWorkload(10, 150)).toBe(20); // >100 clamps to 100
  });

  it('treats null buffer as 0', () => {
    expect(computeWorkload(8, null)).toBe(8);
    expect(computeWorkload(8, undefined)).toBe(8);
  });
});

describe('EXPERTISE_SUBTASKS (REQ-TASK-09)', () => {
  it('lists exactly 5 entries in PRD-spec order', () => {
    expect(EXPERTISE_SUBTASKS).toEqual([
      'Çertyoj hazırlığı',
      'Spesifikasiya',
      'Möhür + imza',
      'Çap + ciltləmə',
      'Ekspertizaya təhvil',
    ]);
  });
});
