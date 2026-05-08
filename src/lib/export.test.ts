import { describe, expect, it } from 'vitest';
import { rowsToCsv } from './export';

describe('rowsToCsv', () => {
  it('starts with a UTF-8 BOM so Excel autodetects encoding', () => {
    const csv = rowsToCsv(['a', 'b'], [[1, 2]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('uses CRLF row separators', () => {
    const csv = rowsToCsv(['a'], [[1], [2]]);
    expect(csv.split('\r\n').length).toBe(3);
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = rowsToCsv(['x'], [['a,b'], ['"hi"'], ['line\n2']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"""hi"""');
    expect(csv).toContain('"line\n2"');
  });

  it('renders null/undefined as empty', () => {
    const csv = rowsToCsv(['a', 'b'], [[null, undefined]]);
    expect(csv).toContain('\r\n,\r\n');
  });

  it('serialises numbers without quotes', () => {
    const csv = rowsToCsv(['n'], [[42], [3.14]]);
    expect(csv).toMatch(/\r\n42\r\n/);
    expect(csv).toMatch(/\r\n3\.14$/);
  });
});
