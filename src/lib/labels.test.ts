import { describe, it, expect } from 'vitest';
import {
  CANCEL_REASONS,
  CLIENT_STAGE_CONFIDENCE,
  CLIENT_STAGE_LABEL,
  CLIENT_STAGE_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TASK_STATUS_TONE,
} from './labels';

describe('task status labels (REQ-TASK)', () => {
  it('every status in the kanban order has a label and tone', () => {
    for (const s of TASK_STATUS_ORDER) {
      expect(TASK_STATUS_LABEL[s]).toBeTruthy();
      expect(TASK_STATUS_TONE[s]).toBeDefined();
      expect(TASK_STATUS_TONE[s].dot).toMatch(/^#/);
    }
  });

  it('cancelled is intentionally excluded from the kanban order', () => {
    expect(TASK_STATUS_ORDER).not.toContain('cancelled');
    // …but still has a label + tone (used in lists, archive)
    expect(TASK_STATUS_LABEL.cancelled).toBeTruthy();
    expect(TASK_STATUS_TONE.cancelled).toBeDefined();
  });
});

describe('client pipeline (REQ-CRM-01..02)', () => {
  it('every stage has a label and a confidence percentage', () => {
    for (const s of CLIENT_STAGE_ORDER) {
      expect(CLIENT_STAGE_LABEL[s]).toBeTruthy();
      expect(typeof CLIENT_STAGE_CONFIDENCE[s]).toBe('number');
    }
  });

  it('confidence percentages stay inside 0..100', () => {
    for (const s of CLIENT_STAGE_ORDER) {
      const pct = CLIENT_STAGE_CONFIDENCE[s];
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});

describe('cancel reasons (REQ-TASK-04)', () => {
  it('always offers an "other" escape hatch', () => {
    expect(CANCEL_REASONS).toContain('Digər');
  });

  it('has at least 5 fixed reasons', () => {
    expect(CANCEL_REASONS.length).toBeGreaterThanOrEqual(5);
  });
});
