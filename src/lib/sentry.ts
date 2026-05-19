import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Traces for performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    // Strip console.log calls handled by esbuild in prod; only capture real errors
    beforeSend(event) {
      if (import.meta.env.DEV) return event;
      // Don't send ChunkLoadError spam (network issue, not a bug)
      if (event.exception?.values?.[0]?.type === 'ChunkLoadError') return null;
      return event;
    },
  });
}

// PRD §9.4 — attribute frontend errors to the signed-in user. Call after auth
// hydrates; pass null on logout to detach the user context.
export function setSentryUser(user: { id: string; email: string } | null): void {
  if (!dsn) return;
  Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}

export { Sentry };
