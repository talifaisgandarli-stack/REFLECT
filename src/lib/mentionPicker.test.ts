import { describe, expect, it } from 'vitest';
import { applyMention, findMentionTrigger } from './mentionPicker';

describe('findMentionTrigger', () => {
  it('returns null when there is no @ before the caret', () => {
    expect(findMentionTrigger('hello world', 5)).toBeNull();
  });

  it('detects an @ at position 0 with empty query', () => {
    const t = findMentionTrigger('@', 1);
    expect(t).toEqual({ start: 0, end: 1, query: '' });
  });

  it('captures the partial query after @', () => {
    const t = findMentionTrigger('@tal', 4);
    expect(t).toEqual({ start: 0, end: 4, query: 'tal' });
  });

  it('triggers when @ follows whitespace', () => {
    const t = findMentionTrigger('hi @ali', 7);
    expect(t).toEqual({ start: 3, end: 7, query: 'ali' });
  });

  it('does NOT trigger when @ is immediately preceded by a non-space', () => {
    // an email-style "@" should not open the picker
    expect(findMentionTrigger('email@host', 9)).toBeNull();
  });

  it('closes the trigger once the user types whitespace inside the query', () => {
    expect(findMentionTrigger('@tal ali', 8)).toBeNull();
  });

  it('closes the trigger after a comma', () => {
    expect(findMentionTrigger('@tal,', 5)).toBeNull();
  });

  it('handles caret in the middle — only looks back to nearest @', () => {
    // "@tal" at start, caret at 2 → query is "t"
    const t = findMentionTrigger('@tal hi', 2);
    expect(t).toEqual({ start: 0, end: 2, query: 't' });
  });

  it('returns null when caret is 0', () => {
    expect(findMentionTrigger('anything', 0)).toBeNull();
  });
});

describe('applyMention', () => {
  it('replaces the trigger range with @<uuid> + trailing space', () => {
    const r = applyMention('hi @tal', { start: 3, end: 7, query: 'tal' }, 'abc-123');
    expect(r.next).toBe('hi @abc-123 ');
    expect(r.caret).toBe('hi @abc-123 '.length);
  });

  it('preserves text after the trigger range', () => {
    const r = applyMention(
      'hey @bo there',
      { start: 4, end: 7, query: 'bo' },
      'uuid-9',
    );
    expect(r.next).toBe('hey @uuid-9 there');
  });

  it('handles trigger at index 0', () => {
    const r = applyMention('@', { start: 0, end: 1, query: '' }, 'uuid-x');
    expect(r.next).toBe('@uuid-x ');
    expect(r.caret).toBe('@uuid-x '.length);
  });
});
