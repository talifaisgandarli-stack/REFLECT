/**
 * Lightweight modal — designstyle4 §6.1 motion (--dur-slow modal/drawer).
 * No "destructive" variant; destructive intents use red text inside, not a red
 * button (designstyle4 §4.1 guarantee).
 */
import { ReactNode, useEffect } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

export function Modal({ title, onClose, children, footer, width = 480 }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div
        className="card w-full"
        style={{ maxWidth: width, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between mb-4">
          <h2 className="text-h2">{title}</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            aria-label="Bağla"
          >
            ✕
          </button>
        </header>
        {children}
        {footer ? <footer className="flex justify-end gap-2 mt-6">{footer}</footer> : null}
      </div>
    </div>
  );
}
