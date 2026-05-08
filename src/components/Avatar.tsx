import type { PresenceStatus } from '@/types/db';

type Props = {
  name: string | null | undefined;
  url?: string | null;
  size?: number;
  presence?: PresenceStatus;
};

const DOT_COLOR: Record<PresenceStatus, string> = {
  online: 'var(--presence-online, #22C55E)',
  away: '#F59E0B',
  offline: '#A8B0AB',
};

export function Avatar({ name, url, size = 32, presence }: Props) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <span
        className="block rounded-full font-semibold"
        style={{
          width: size,
          height: size,
          lineHeight: `${size}px`,
          textAlign: 'center',
          background: url
            ? `url(${url}) center/cover`
            : 'linear-gradient(135deg, var(--brand-mid), var(--brand-mist))',
          color: 'var(--brand-text)',
          fontSize: Math.round(size * 0.4),
        }}
      >
        {url ? '' : initials}
      </span>
      {presence ? (
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: size > 32 ? 10 : 8,
            height: size > 32 ? 10 : 8,
            background: DOT_COLOR[presence],
            boxShadow: '0 0 0 2px var(--surface)',
          }}
          aria-label={presence}
        />
      ) : null}
    </span>
  );
}
