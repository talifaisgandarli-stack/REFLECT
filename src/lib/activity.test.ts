import { describe, expect, it } from 'vitest';
import { activityHref } from './activity';

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
