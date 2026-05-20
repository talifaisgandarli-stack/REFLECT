import { useState } from 'react';

/**
 * Floating action bar for bulk-mode in the Tasks Cədvəl view.
 * Lives at the bottom of the viewport, contains the selection count and
 * the admin-only "reassign" + "archive" actions plus a close button.
 *
 * Owns its own ephemeral UI state (reassign popover open / target choice);
 * everything else is passed in. The bar renders only when bulkMode is on
 * AND there's at least one selection — that gating stays in the parent.
 */
interface Props {
  selectedCount: number;
  isAdmin: boolean;
  profiles: Array<{ id: string; full_name: string | null }>;
  onReassign: (assigneeId: string) => void;
  isReassigning: boolean;
  onArchive: () => void;
  isArchiving: boolean;
  onClose: () => void;
}

export function BulkActionBar({
  selectedCount,
  isAdmin,
  profiles,
  onReassign,
  isReassigning,
  onArchive,
  isArchiving,
  onClose,
}: Props) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState('');

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-capsule px-4 py-3 flex items-center gap-3 shadow-xl z-40"
      style={{
        background: 'var(--ink)',
        color: 'var(--canvas)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: 320,
      }}
      role="region"
      aria-label="Toplu əməliyyatlar"
    >
      <span className="text-body font-medium">{selectedCount} seçili</span>
      <span style={{ flex: 1 }} />

      {isAdmin ? (
        <div className="relative">
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--canvas)' }}
            onClick={() => setReassignOpen((v) => !v)}
            aria-expanded={reassignOpen}
          >
            Yenidən təyin et
          </button>
          {reassignOpen ? (
            <div
              className="absolute bottom-full mb-2 right-0 rounded-card p-2 w-[220px]"
              style={{
                background: 'var(--ink)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <select
                className="input w-full mb-2"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)' }}
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                aria-label="Yeni icraçı"
              >
                <option value="">İcraçı seçin…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="chip text-meta"
                  onClick={() => { setReassignOpen(false); setReassignTarget(''); }}
                >
                  Ləğv
                </button>
                <button
                  type="button"
                  className="chip"
                  style={{ background: 'var(--brand-action)', color: 'var(--ink)' }}
                  disabled={!reassignTarget || isReassigning}
                  onClick={() => onReassign(reassignTarget)}
                >
                  {isReassigning ? '…' : 'Təyin et'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="chip"
        style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--canvas)' }}
        disabled={isArchiving}
        onClick={onArchive}
      >
        {isArchiving ? 'Arxivlənir…' : 'Arxivlə'}
      </button>

      <button
        type="button"
        className="chip"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)' }}
        onClick={onClose}
        aria-label="Seçim rejimini bağla"
      >
        ×
      </button>
    </div>
  );
}
