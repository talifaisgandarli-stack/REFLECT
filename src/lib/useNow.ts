/**
 * useNow — returns a periodically-refreshed Date so relative-time labels
 * ("3 dəq əvvəl") auto-update without a page reload. Default tick 60s.
 *
 * Cheap: a single 60s setInterval per consumer. Modal/menu-scoped instances
 * are typically short-lived so memory cost is negligible.
 */
import { useEffect, useState } from 'react';

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
