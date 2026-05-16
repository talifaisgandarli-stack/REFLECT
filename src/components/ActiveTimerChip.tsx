/**
 * Topbar chip — shows the currently running time-tracking timer (if any).
 * Tick-updated every second so the elapsed display feels live; click to
 * stop the timer.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, useActiveTimeEntry, useStopTimer } from '@/lib/useTimeTracking';

export function ActiveTimerChip() {
  const { data: active } = useActiveTimeEntry();
  const stop = useStopTimer();
  // Tick every second when a timer is running
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const elapsed = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-btn text-meta"
      style={{
        background: 'var(--brand-action)',
        color: 'var(--ink)',
        fontVariantNumeric: 'tabular-nums',
      }}
      title="Aktiv timer"
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--ink)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <Link to={`/tapşırıqlar`} style={{ color: 'var(--ink)' }} className="font-medium">
        {formatDuration(elapsed)}
      </Link>
      <button
        type="button"
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className="opacity-70 hover:opacity-100"
        style={{ color: 'var(--ink)', fontSize: 12 }}
        title="Timer-i dayandır"
        aria-label="Timer-i dayandır"
      >
        ⏹
      </button>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
