import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './styles/index.css';

// PRD §9.4: Sentry frontend error capture. VITE_SENTRY_DSN set in Vercel env.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
    // PRD §9.1: stack traces hidden from users; full detail goes to Sentry.
    beforeSend(event) {
      if (event.exception) {
        const err = event.exception.values?.[0]?.value ?? '';
        // Strip tokens from breadcrumb data before sending.
        if (Array.isArray(event.breadcrumbs)) {
          for (const b of event.breadcrumbs as Array<{ data?: Record<string, unknown> }>) {
            if (b.data?.token) delete b.data.token;
          }
        }
        // Don't report user-facing HttpError 4xx — only log server 5xx.
        if (/\b4\d\d\b/.test(err)) return null;
      }
      return event;
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        {/* PRD §9.4: Vercel Analytics — LCP/TTI tracking */}
        <Analytics />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
