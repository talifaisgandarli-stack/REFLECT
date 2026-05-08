import { ReactNode } from 'react';
import { Mascot } from './Mascot';

type Props = { title: string; body?: string; cta?: ReactNode };

export function EmptyState({ title, body, cta }: Props) {
  return (
    <div className="card flex flex-col items-center text-center py-12 gap-3">
      <Mascot size={96} decorative={false} label={title} />
      <h3 className="text-h3 mt-2">{title}</h3>
      {body ? (
        <p className="text-body max-w-md" style={{ color: 'var(--text-muted)' }}>
          {body}
        </p>
      ) : null}
      {cta ? <div className="mt-3">{cta}</div> : null}
    </div>
  );
}
