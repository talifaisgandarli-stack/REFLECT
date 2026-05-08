/**
 * Edge-compatible sliding-window rate limiter (PRD §9.1).
 * Backed by Upstash Redis REST API when UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are configured; falls back to a per-instance
 * in-memory map (functional for dev / single-region cold starts but not
 * a production rate-limit on its own).
 *
 * Limits per PRD §9.1:
 *   admin     100 / minute
 *   user       30 / minute
 *   anonymous  10 / minute
 */

export type Tier = 'admin' | 'user' | 'anon';

const LIMITS: Record<Tier, { max: number; windowSec: number }> = {
  admin: { max: 100, windowSec: 60 },
  user: { max: 30, windowSec: 60 },
  anon: { max: 10, windowSec: 60 },
};

const memory = new Map<string, number[]>();

function memoryHit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  const arr = (memory.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= max) return { allowed: false, remaining: 0, retryAfter: windowSec };
  arr.push(now);
  memory.set(key, arr);
  return { allowed: true, remaining: max - arr.length, retryAfter: 0 };
}

async function upstashHit(key: string, max: number, windowSec: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // ZADD score=now ; ZREMRANGEBYSCORE 0 (now-window) ; ZCARD ; EXPIRE
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  const pipe = [
    ['ZREMRANGEBYSCORE', key, '0', cutoff.toString()],
    ['ZADD', key, now.toString(), `${now}-${Math.random().toString(36).slice(2)}`],
    ['ZCARD', key],
    ['EXPIRE', key, windowSec.toString()],
  ];
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(pipe),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result: number }>;
    const count = data[2]?.result ?? 0;
    if (count > max) {
      return { allowed: false, remaining: 0, retryAfter: windowSec };
    }
    return { allowed: true, remaining: Math.max(0, max - count), retryAfter: 0 };
  } catch {
    return null;
  }
}

export async function rateLimit(opts: {
  tier: Tier;
  identifier: string;
}): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const { tier, identifier } = opts;
  const { max, windowSec } = LIMITS[tier];
  const key = `rl:${tier}:${identifier}`;
  const remote = await upstashHit(key, max, windowSec);
  if (remote) return remote;
  return memoryHit(key, max, windowSec);
}

export function rateLimitHeaders(result: {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}): Record<string, string> {
  const h: Record<string, string> = {
    'x-ratelimit-remaining': String(result.remaining),
  };
  if (!result.allowed) h['retry-after'] = String(result.retryAfter);
  return h;
}
