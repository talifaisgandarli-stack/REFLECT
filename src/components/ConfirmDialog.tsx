/**
 * Reusable confirm dialog (PRD §6.7). Use instead of native window.confirm
 * for destructive actions so the prompt looks consistent + theme-aware.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   ...
 *   <ConfirmDialog
 *     open={open}
 *     title="Layihəni sil?"
 *     body="Bu əməliyyat geri qaytarıla bilməz."
 *     confirmLabel="Sil"
 *     destructive
 *     onConfirm={() => { delete.mutate(); setOpen(false); }}
 *     onCancel={() => setOpen(false)}
 *   />
 */
import { useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Təsdiqlə',
  cancelLabel = 'Ləğv',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[55] flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm"
        style={{ padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h3 mb-2">{title}</h2>
        {body ? <p className="text-body" style={{ color: 'var(--text-muted)' }}>{body}</p> : null}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-primary"
            style={destructive ? { background: 'var(--error-deep, #b3261e)', color: 'white' } : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
