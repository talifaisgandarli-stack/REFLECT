import { describe, expect, it } from 'vitest';
import { buildRtf } from './rtf';

describe('buildRtf', () => {
  it('wraps content in a valid rtf1 envelope', () => {
    const out = buildRtf({ title: 'Test', body: 'hello' });
    expect(out.startsWith('{\\rtf1')).toBe(true);
    expect(out.endsWith('}')).toBe(true);
  });

  it('escapes braces and backslashes in the body', () => {
    const out = buildRtf({ title: 'X', body: '{hi}\\path' });
    expect(out).toContain('\\{hi\\}\\\\path');
  });

  it('translates newlines to \\par paragraph breaks', () => {
    const out = buildRtf({ title: 'X', body: 'a\nb' });
    expect(out).toContain('a\\par\nb');
  });

  it('encodes non-ASCII characters with \\uN escapes', () => {
    const out = buildRtf({ title: 'X', body: 'ə' });
    // ə = U+0259 = 601 decimal — fits in 16-bit, no surrogate
    expect(out).toContain('\\u601?');
  });

  it('renders the title as bold heading', () => {
    const out = buildRtf({ title: 'Akt', body: 'b' });
    expect(out).toContain('{\\b\\fs32 Akt\\par}');
  });

  it('includes firm name as italic subtitle when provided', () => {
    const out = buildRtf({ title: 'X', body: 'b', firmName: 'Reflect' });
    expect(out).toContain('{\\fs18\\i Reflect\\par}');
  });
});
