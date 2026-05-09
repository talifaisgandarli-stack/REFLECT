import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';
import { installGlobalHandlers } from './lib/observability';

installGlobalHandlers();

/**
 * React Query defaults (slice 138, audit pass).
 *
 *   staleTime: 30 s
 *     Most pages back their lists with a useRealtimeSync subscription
 *     (slice 5 + 134). When realtime delivers a row change the cache
 *     invalidates instantly, so the staleTime here is the floor for
 *     pages that don't subscribe (Cmd+K previews, audit log,
 *     finance summaries). Below 30 s we'd burn refetches on every
 *     drawer open; above 60 s drawer freshness suffers.
 *
 *   gcTime: 5 min
 *     Default is 5 min already; pinning explicitly so a future React
 *     Query upgrade doesn't silently shorten it. Long enough that a
 *     user navigating between board ↔ table ↔ detail stays warm.
 *
 *   refetchOnWindowFocus: false
 *     Realtime makes focus-refetch redundant and creates a flicker
 *     storm on multi-tab macOS workflows. Keep off.
 *
 *   refetchOnReconnect: true
 *     Default is true — pinned for the same reason as gcTime. After
 *     network drop we want the next fetch to repaint with fresh data.
 *
 *   retry: 1
 *     One automatic retry covers a single transient 5xx without
 *     hammering the server when RLS denies (a real 401/403 should
 *     surface immediately to the user).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
