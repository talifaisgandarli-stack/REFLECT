/**
 * Frontend observability shim (PRD §9.4).
 *
 * Sentry SDK is intentionally not added to dependencies — it lands later
 * when the Sentry project DSN is provisioned. This file gives the rest
 * of the codebase a stable API (`reportError`, `breadcrumb`) that:
 *  - in dev: console.error / console.info
 *  - in prod with VITE_SENTRY_DSN set: posts to Sentry envelope endpoint
 *    via `navigator.sendBeacon` (works during page unload too)
 *
 * Switching to the official @sentry/react SDK later is a single import
 * change in this file; call sites stay stable.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = (import.meta.env.MODE ?? 'development') as string;
const RELEASE = (import.meta.env.VITE_RELEASE as string | undefined) ?? 'reflect@local';

type Severity = 'fatal' | 'error' | 'warning' | 'info';

type Breadcrumb = {
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: number;
};

const breadcrumbs: Breadcrumb[] = [];
const MAX_BREADCRUMBS = 30;

export function breadcrumb(category: string, message?: string, data?: Record<string, unknown>) {
  breadcrumbs.push({
    category,
    message,
    data,
    timestamp: Date.now() / 1000,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

function shouldSend(): boolean {
  return Boolean(DSN) && ENV === 'production';
}

function envelopeUrl(): string | null {
  if (!DSN) return null;
  try {
    const u = new URL(DSN);
    const projectId = u.pathname.replace(/^\//, '');
    const key = u.username;
    return `${u.protocol}//${u.host}/api/${projectId}/envelope/?sentry_version=7&sentry_key=${key}`;
  } catch {
    return null;
  }
}

export function reportError(err: unknown, context?: Record<string, unknown>, level: Severity = 'error') {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
  const stack = err instanceof Error ? err.stack : undefined;
  if (!shouldSend()) {
    // eslint-disable-next-line no-console
    console.error('[obs]', level, message, { context, stack });
    return;
  }
  const url = envelopeUrl();
  if (!url) return;
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level,
    release: RELEASE,
    environment: ENV,
    breadcrumbs: { values: breadcrumbs },
    contexts: { runtime: { name: 'browser' } },
    extra: context ?? {},
    exception: stack
      ? { values: [{ type: 'Error', value: message, stacktrace: { frames: parseFrames(stack) } }] }
      : undefined,
    message: stack ? undefined : { formatted: message },
  };
  const payload =
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/x-sentry-envelope' }));
    } else {
      fetch(url, {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/x-sentry-envelope' },
        keepalive: true,
      }).catch(() => {
        /* swallow */
      });
    }
  } catch {
    /* never let observability throw */
  }
}

function parseFrames(stack: string): Array<{ filename: string; lineno?: number; colno?: number; function?: string }> {
  return stack
    .split('\n')
    .slice(0, 20)
    .map((line) => {
      const m = line.match(/at\s+([^(]+)\s+\(([^:]+):(\d+):(\d+)\)/);
      if (m) {
        return {
          function: m[1].trim(),
          filename: m[2],
          lineno: Number(m[3]),
          colno: Number(m[4]),
        };
      }
      return { filename: line.trim() };
    });
}

let installed = false;
export function installGlobalHandlers() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    reportError(e.error ?? new Error(e.message), { source: 'window.error' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason ?? 'unhandledrejection', { source: 'unhandledrejection' });
  });
}
