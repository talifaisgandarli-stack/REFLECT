/**
 * Particle sphere — designstyle4 §7.1.
 * Fibonacci-distributed dots, projected to 2D. Pre-rendered at mount, then drifts via CSS.
 */
import { useMemo } from 'react';

type Props = { size?: number; particles?: number; className?: string };

export function MiraiSphere({ size = 360, particles = 400, className = '' }: Props) {
  const dots = useMemo(() => {
    const out: Array<{ x: number; y: number; o: number }> = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < particles; i++) {
      const y = 1 - (i / (particles - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      const opacity = 0.4 + Math.max(0, z) * 0.6;
      out.push({ x, y, o: opacity });
    }
    return out;
  }, [particles]);

  const r = size / 2 - 4;
  return (
    <div
      className={`mirai-sphere relative ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--mirai-glow) 0%, transparent 70%)',
          filter: 'blur(24px)',
        }}
      />
      <svg
        viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}
        width={size}
        height={size}
        style={{ position: 'relative' }}
      >
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x * r}
            cy={d.y * r}
            r={1}
            fill="var(--mirai-particle)"
            opacity={d.o}
          />
        ))}
      </svg>
    </div>
  );
}
