import { describe, expect, it } from 'vitest';
import {
  activityDiffSummary,
  activityHref,
  fieldLabelKey,
} from './activity';

describe('activityHref', () => {
  it('returns null when entity_id is null', () => {
    expect(activityHref('task', null)).toBe(null);
  });

  it('routes tasks to the kanban with hash highlight', () => {
    expect(activityHref('task', 'abc-123')).toBe('/tapşırıqlar#task-abc-123');
  });

  it('routes task comments to the parent task', () => {
    expect(activityHref('task_comment', 'abc-123')).toBe('/tapşırıqlar#task-abc-123');
  });

  it('routes projects to their detail page', () => {
    expect(activityHref('project', 'p-1')).toBe('/layihelər/p-1');
  });

  it('routes clients to the CRM with hash', () => {
    expect(activityHref('client', 'c-1')).toBe('/müştərilər#client-c-1');
  });

  it('returns null for unknown entity types', () => {
    expect(activityHref('budget_event', 'x')).toBe(null);
  });
});

describe('fieldLabelKey', () => {
  it('namespaces the field as activity.field.<name>', () => {
    expect(fieldLabelKey('status')).toBe('activity.field.status');
    expect(fieldLabelKey('phases')).toBe('activity.field.phases');
  });
});

describe('activityDiffSummary', () => {
  // Pretend t() — substitutes {field}/{old}/{new} so we can assert.
  const t = (key: string, vars?: Record<string, string | number>): string => {
    if (key === 'activity.diff.template' && vars) {
      return `${vars.field}: ${vars.old} → ${vars.new}`;
    }
    if (key.startsWith('activity.field.')) return key.slice('activity.field.'.length);
    return key;
  };

  it('returns null when field is missing', () => {
    expect(activityDiffSummary(null, 'a', 'b', t)).toBeNull();
  });

  it('formats a simple text diff', () => {
    expect(activityDiffSummary('status', 'queued', 'active', t)).toBe(
      'status: queued → active',
    );
  });

  it('renders missing values as em-dash', () => {
    expect(activityDiffSummary('description', null, 'now there', t)).toBe(
      'description: — → now there',
    );
    expect(activityDiffSummary('description', 'was', null, t)).toBe(
      'description: was → —',
    );
  });

  it('serializes arrays + objects as JSON', () => {
    expect(activityDiffSummary('phases', null, ['TŞ', 'Eskiz'], t)).toBe(
      'phases: — → ["TŞ","Eskiz"]',
    );
  });

  it('truncates long jsonb values to 64 chars + ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = activityDiffSummary('description', null, long, t);
    expect(out).toContain('…');
    // Hard cap: 64 chars of content plus the … glyph.
    const newPart = out!.split('→ ')[1];
    expect(newPart.length).toBeLessThanOrEqual(65);
  });

  it('renders booleans as-is', () => {
    expect(activityDiffSummary('archived_at', false, true, t)).toBe(
      'archived_at: false → true',
    );
  });
});
