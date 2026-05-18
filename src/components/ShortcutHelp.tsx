/**
 * Keyboard shortcut cheat-sheet (PRD §6.3).
 * Opened by pressing `?` (when not in an input).
 */
import { useEffect, useMemo, useState } from 'react';

// PRD §6.3 — render Ctrl on Win/Linux, ⌘ on macOS; detected from navigator
function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
}

function buildShortcuts(mod: string): Array<{ keys: string[]; label: string }> {
  return [
    { keys: [mod, 'K'], label: 'Universal axtarış' },
    { keys: [mod, 'N'], label: 'Yeni tapşırıq (kontekst-aware)' },
    { keys: [mod, '/'], label: 'MIRAI panelini aç/bağla' },
    { keys: ['G', 'D'], label: 'Dashboard-a get' },
    { keys: ['G', 'T'], label: 'Tapşırıqlara get' },
    { keys: ['G', 'P'], label: 'Layihələrə get' },
    { keys: ['G', 'M'], label: 'Müştərilərə get' },
    { keys: ['G', 'F'], label: 'Maliyyəyə get' },
    { keys: ['B'], label: 'Bildiriş zəngini aç/bağla' },
    { keys: ['N'], label: 'MIRAI-də yeni söhbət (MIRAI səhifəsində)' },
    { keys: ['T'], label: 'Təqvimdə bu günə qayıt' },
    { keys: ['M / W / D'], label: 'Təqvim: ay / həftə / gün görünüşü' },
    { keys: ['←', '→'], label: 'Təqvimdə əvvəlki / növbəti dövr' },
    { keys: ['/'], label: 'Axtarış qutusuna fokuslan' },
    { keys: ['?'], label: 'Bu yardım pəncərəsi' },
    { keys: ['Esc'], label: 'Modal/paneli bağla · axtarışı təmizlə' },
  ];
}

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const isMac = useMemo(detectMac, []);
  const SHORTCUTS = useMemo(() => buildShortcuts(isMac ? '⌘' : 'Ctrl'), [isMac]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (e.key === '?' && !editing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Klaviatura qısa yolları"
      className="fixed inset-0 z-[55] flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.5)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-md"
        style={{ padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-h3">Klaviatura qısa yolları</h2>
          <button
            type="button"
            className="text-meta opacity-60 hover:opacity-100"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setOpen(false)}
            aria-label="Bağla"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys.join('+')} className="flex items-center justify-between gap-3 py-1">
              <span className="text-body" style={{ color: 'var(--text)' }}>{s.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 11,
                      background: 'var(--surface-mist)',
                      color: 'var(--text)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      border: '1px solid var(--line)',
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 22,
                      textAlign: 'center',
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-meta mt-4" style={{ color: 'var(--text-muted)' }}>
          {isMac ? 'macOS: ⌘ istifadə edin' : 'Windows/Linux: Ctrl istifadə edin'}
        </p>
      </div>
    </div>
  );
}
