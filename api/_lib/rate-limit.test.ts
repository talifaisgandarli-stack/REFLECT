import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rateLimit } from './rate-limit';

describe('rateLimit (in-memory fallback)', () => {
  beforeEach(() => {
    // Force in-memory mode by clearing any Upstash env vars
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('allows the first request for any tier', async () => {
    const r = await rateLimit({ tier: 'admin', identifier: 'fresh-admin' });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(99);
  });

  it('blocks anon after 10 hits in the window', async () => {
    const id = `anon-${Math.random()}`;
    let last;
    for (let i = 0; i < 10; i++) {
      last = await rateLimit({ tier: 'anon', identifier: id });
      expect(last.allowed, `hit ${i + 1}`).toBe(true);
    }
    const blocked = await rateLimit({ tier: 'anon', identifier: id });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('isolates buckets per identifier', async () => {
    for (let i = 0; i < 10; i++) {
      await rateLimit({ tier: 'anon', identifier: 'A' });
    }
    const aBlocked = await rateLimit({ tier: 'anon', identifier: 'A' });
    expect(aBlocked.allowed).toBe(false);
    const bAllowed = await rateLimit({ tier: 'anon', identifier: 'B' });
    expect(bAllowed.allowed).toBe(true);
  });

  it('user tier allows 30 hits before blocking', async () => {
    const id = `user-${Math.random()}`;
    for (let i = 0; i < 30; i++) {
      const r = await rateLimit({ tier: 'user', identifier: id });
      expect(r.allowed, `hit ${i + 1}`).toBe(true);
    }
    const blocked = await rateLimit({ tier: 'user', identifier: id });
    expect(blocked.allowed).toBe(false);
  });
});
