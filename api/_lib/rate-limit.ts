/**
 * API rate limiting — PRD §9.1.
 * Sliding window per IP+user. Limits: 100/min admin, 30/min user, 10/min anon.
 * Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars.
 * Fails open (logs warning) when Upstash is not configured — never blocks prod
 * on a missing env var.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { AuthedUser } from './auth';

type RateLimitTier = 'admin' | 'user' | 'anon';

let limiterAdmin: Ratelimit | null = null;
let limiterUser: Ratelimit | null = null;
let limiterAnon: Ratelimit | null = null;

function getLimiters() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  if (!limiterAdmin) {
    const redis = new Redis({ url, token });
    limiterAdmin = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '60 s'), prefix: 'rl:admin' });
    limiterUser  = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30,  '60 s'), prefix: 'rl:user' });
    limiterAnon  = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10,  '60 s'), prefix: 'rl:anon' });
  }
  return { admin: limiterAdmin!, user: limiterUser!, anon: limiterAnon! };
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Returns a 429 Response if rate limit exceeded, null if allowed.
 * Call at the top of every /api/* handler after optional auth.
 */
export async function checkRateLimit(
  req: Request,
  user: AuthedUser | null,
): Promise<Response | null> {
  const limiters = getLimiters();
  if (!limiters) return null; // Upstash not configured — fail open

  const ip = getClientIp(req);
  const tier: RateLimitTier = !user ? 'anon' : user.isAdmin ? 'admin' : 'user';
  const key = user ? `${ip}:${user.id}` : ip;
  const limiter = limiters[tier];

  const { success, limit, remaining, reset } = await limiter.limit(key);
  if (success) return null;

  return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please slow down.' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-limit': String(limit),
      'x-ratelimit-remaining': String(remaining),
      'x-ratelimit-reset': String(reset),
      'retry-after': String(Math.ceil((reset - Date.now()) / 1000)),
    },
  });
}
