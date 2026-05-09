/**
 * Pull-to-refresh hook (PRD §6.7 mobile UX).
 *
 * Attaches touch handlers that detect a pull-down at the top of the
 * scrollable area. When the user releases past the threshold, fires
 * `onRefresh()` and shows a small Mindaro indicator. Desktop calls
 * are no-ops (window.innerWidth ≥1024 short-circuits).
 *
 * Returns { offset, refreshing, bind } — caller spreads `bind` onto
 * the container element and renders the indicator using `offset`.
 */
import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;
const MAX_PULL = 100;

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const start = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (refreshing) return;
    setOffset(0);
  }, [refreshing]);

  function onTouchStart(e: React.TouchEvent) {
    if (window.innerWidth >= 1024) return;
    if (window.scrollY > 0) return; // only pull when at top
    start.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (start.current == null) return;
    const dy = e.touches[0].clientY - start.current;
    if (dy <= 0) return;
    setOffset(Math.min(MAX_PULL, dy * 0.5));
  }

  async function onTouchEnd() {
    const fired = offset >= THRESHOLD;
    start.current = null;
    if (fired) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setOffset(0);
    }
  }

  return {
    offset,
    refreshing,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
