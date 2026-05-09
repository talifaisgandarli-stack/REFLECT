import { ReactNode } from 'react';

type Props = { meta?: string; title: string; actions?: ReactNode };

export function PageHead({ meta, title, actions }: Props) {
  return (
    <header className="page-head">
      {meta ? <div className="page-head-meta">{meta}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-3 lg:gap-4">
        <h1 className="text-h1 break-words" style={{ minWidth: 0, maxWidth: '100%' }}>
          {title}
        </h1>
        {actions ? (
          <div className="page-head-actions m-0 w-full lg:w-auto flex-wrap">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
