import { describe, expect, it } from 'vitest';
import { escapeIlike } from './search';

describe('escapeIlike', () => {
  it('passes plain text through unchanged', () => {
    expect(escapeIlike('aksent group')).toBe('aksent group');
  });

  it('escapes % so the value matches literally', () => {
    expect(escapeIlike('100%')).toBe('100\\%');
  });

  it('escapes _ so single-char wildcard is neutralised', () => {
    expect(escapeIlike('a_b')).toBe('a\\_b');
  });

  it('escapes the backslash itself', () => {
    expect(escapeIlike('path\\here')).toBe('path\\\\here');
  });

  it('handles a mix of all three special characters', () => {
    expect(escapeIlike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});
