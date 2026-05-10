/**
 * Layout-matching skeleton primitives (PRD §6.7). Use these instead of the
 * "Yüklənir…" string for loading states. Animated via the `skeleton-pulse`
 * keyframe defined in styles/index.css.
 */
import { CSSProperties } from 'react';

export function SkeletonBox({
  width = '100%',
  height = 16,
  radius = 6,
  style,
  className = '',
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 16 }}>
      <SkeletonBox width="40%" height={12} />
      <SkeletonBox width="80%" height={20} style={{ marginTop: 10 }} />
      <SkeletonBox width="60%" height={14} style={{ marginTop: 8 }} />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBox key={i} height={48} />
      ))}
    </div>
  );
}
