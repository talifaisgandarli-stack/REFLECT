/**
 * Server-side Sentry capture (PRD §9.4 — "Sentry for frontend + serverless errors").
 *
 * Edge runtime can't use the @sentry/node SDK, so we POST directly to the
 * Sentry store endpoint. Failures are intentionally silent — Sentry being
 * down must never mask the real error path.
 *
 * Usage patterns:
 *   1. Top-level wrap:   `export default withSentry(handler, 'cron/cmo')`
 *   2. Manual capture:   `await captureException(e, { route, userId })`
 *
 * Route name is included as a tag so we can filter by endpoint in Sentry.
 */

export type SentryContext = {
  route?: string;
  userId?: string | null;
  method?: string;
  url?: string;
};

function parseDsn(dsn: string): { key: string; host: string; project: string } | null {
  // Format: https://<key>@<host>/<project>
  const match = dsn.match(/^https?:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;
  return { key: match[1], host: match[2], project: match[3] };
}

export async function captureException(e: unknown, ctx: SentryContext = {}): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // No DSN configured = silent no-op (e.g. local dev)

  const parsed = parseDsn(dsn);
  if (!parsed) return;

  try {
    const err = e as Error;
    const payload = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: 'error',
      sdk: { name: 'reflect-api', version: '1' },
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'production',
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
      tags: {
        route: ctx.route ?? 'unknown',
        method: ctx.method ?? undefined,
      },
      user: ctx.userId ? { id: ctx.userId } : undefined,
      request: ctx.url ? { url: ctx.url, method: ctx.method } : undefined,
      exception: {
        values: [
          {
            type: err?.name ?? 'Error',
            value: err?.message ?? String(e),
            stacktrace: err?.stack
              ? { frames: parseStack(err.stack) }
              : undefined,
          },
        ],
      },
    };

    await fetch(`https://${parsed.host}/api/${parsed.project}/store/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=reflect-api/1`,
      },
      body: JSON.stringify(payload),
    }).catch(() => null);
  } catch {
    // Intentionally silent — Sentry failure must never mask the real error.
  }
}

function parseStack(stack: string): Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> {
  // Lightweight parser — V8/Node format: "    at funcName (path:line:col)"
  return stack
    .split('\n')
    .slice(1, 21) // skip the message line, cap at 20 frames
    .map((line) => {
      const m = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ??
                line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (!m) return null;
      if (m.length === 5) {
        return { function: m[1], filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) };
      }
      return { filename: m[1], lineno: Number(m[2]), colno: Number(m[3]) };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .reverse(); // Sentry expects oldest-first
}

/**
 * Wrap an edge/serverless handler so any thrown exception (whether or not the
 * handler itself catches it) is captured to Sentry with route context. The
 * wrapper preserves the handler's normal response, only intercepting throws.
 */
export function withSentry<T extends (req: Request, ...rest: unknown[]) => Promise<Response>>(
  handler: T,
  route: string,
): T {
  const wrapped = async (req: Request, ...rest: unknown[]): Promise<Response> => {
    try {
      return await handler(req, ...rest);
    } catch (e) {
      await captureException(e, {
        route,
        method: req.method,
        url: req.url,
      });
      // Re-throw so the platform's default error response still fires.
      // (Most handlers also catch internally and return errorResponse(),
      // so this path mainly catches uncaught import/init errors.)
      throw e;
    }
  };
  return wrapped as T;
}
