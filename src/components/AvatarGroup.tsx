/**
 * AvatarGroup — PRD §6.8
 * Stack max 3 avatars + "+N" overflow chip.
 * Each avatar overlaps by 6px using negative margin.
 * Tooltip on the overflow chip lists all hidden names.
 */
import { memo } from 'react';
import { Avatar } from './Avatar';

type Person = {
  id: string;
  name: string | null | undefined;
  avatar_url?: string | null;
};

type Props = {
  people: Person[];
  size?: number;
  /** Max avatars before "+N" chip. PRD §6.8 says max 3. */
  max?: number;
};

function AvatarGroupImpl({ people, size = 28, max = 3 }: Props) {
  if (!people || people.length === 0) return null;

  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  const overlapPx = Math.round(size * 0.22); // ~22% overlap

  const hiddenNames = people
    .slice(max)
    .map((p) => p.name ?? '?')
    .join(', ');

  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 0 }}
      aria-label={people.map((p) => p.name ?? '?').join(', ')}
    >
      {visible.map((p, i) => (
        <span
          key={p.id}
          className="inline-block rounded-full"
          title={p.name ?? undefined}
          style={{
            marginLeft: i === 0 ? 0 : -overlapPx,
            boxShadow: '0 0 0 2px var(--surface)',
            zIndex: visible.length - i, // leftmost avatar on top
            position: 'relative',
          }}
        >
          <Avatar name={p.name} url={p.avatar_url} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full font-semibold"
          title={hiddenNames}
          aria-label={`+${overflow} daha`}
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.38),
            marginLeft: -overlapPx,
            background: 'var(--brand-mid)',
            color: 'var(--brand-text)',
            boxShadow: '0 0 0 2px var(--surface)',
            position: 'relative',
            zIndex: 0,
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

// PRD §perf — memoized to skip re-renders when parent state changes but the
// people array stays referentially equal (common in lists).
export const AvatarGroup = memo(AvatarGroupImpl);
