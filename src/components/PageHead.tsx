import { ReactNode } from 'react';

type Props = { meta?: string; title: string; actions?: ReactNode };

export function PageHead({ meta, title, actions }: Props) {
  return (
    <header className="page-head">
      {meta ? <div className="page-head-meta">{meta}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h1">{title}</h1>
        {actions ? <div className="page-head-actions m-0">{actions}</div> : null}
      </div>
    </header>
  );
}
