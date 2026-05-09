import { describe, expect, it } from 'vitest';
import { clientIp } from './audit';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://example.com/x', { headers });
}

describe('clientIp', () => {
  it('reads first hop from x-forwarded-for', () => {
    const r = reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(clientIp(r)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const r = reqWith({ 'x-real-ip': '9.9.9.9' });
    expect(clientIp(r)).toBe('9.9.9.9');
  });

  it('returns null when no header is present', () => {
    expect(clientIp(reqWith({}))).toBe(null);
  });

  it('trims whitespace around the first hop', () => {
    const r = reqWith({ 'x-forwarded-for': '  10.0.0.1  ,  10.0.0.2' });
    expect(clientIp(r)).toBe('10.0.0.1');
  });
});
