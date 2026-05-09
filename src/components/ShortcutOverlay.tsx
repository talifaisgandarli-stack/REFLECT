/**
 * Keyboard shortcut help (PRD §6.3).
 * Toggled by `?` (or `Shift+/`) anywhere outside text fields. Lists every
 * shortcut the Layout binds (slice 25 + slice 34) plus the `g + letter`
 * chord targets so a power user discovers them on first run.
 */
import { useEffect } from 'react';
import { useT } from '@/lib/i18n';

const NAV_CHORDS: Array<[string, string]> = [
  ['d', 'nav.dashboard'],
  ['t', 'nav.tasks'],
  ['p', 'nav.projects'],
  ['m', 'nav.clients'],
  ['f', 'nav.finance'],
  ['r', 'nav.reports'],
  ['c', 'nav.team.calendar'],
];

type Props = { open: boolean; onClose: () => void };

export function ShortcutOverlay({ open, onClose }: Props) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title')}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{t('shortcuts.title')}</h2>

        <section className="mt-4">
          <h3
            className="text-tiny mb-2"
            style={{
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {t('shortcuts.section.global')}
          </h3>
          <ul className="text-body space-y-2">
            <Row hint={t('shortcuts.cmdk')} />
            <Row hint={t('shortcuts.mirai')} />
            <Row hint={t('shortcuts.help')} />
            <Row hint={t('shortcuts.escape')} />
          </ul>
        </section>

        <section className="mt-5">
          <h3
            className="text-tiny mb-2"
            style={{
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {t('shortcuts.section.nav')}
          </h3>
          <ul className="grid grid-cols-2 gap-2 text-body">
            {NAV_CHORDS.map(([letter, key]) => (
              <li key={letter} className="flex items-center gap-2">
                <kbd
                  className="text-tiny font-medium"
                  style={{
                    background: 'var(--surface-mist)',
                    border: '1px solid var(--line)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontFamily: 'inherit',
                    minWidth: 22,
                    textAlign: 'center',
                    display: 'inline-block',
                  }}
                >
                  {letter}
                </kbd>
                <span style={{ color: 'var(--text-soft)' }}>{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex justify-end mt-6">
          <button type="button" className="btn-primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ hint }: { hint: string }) {
  // Render the "Cmd+K — text" pattern: `kbd` for the chord, normal text after the em-dash.
  const [chord, ...rest] = hint.split(' — ');
  const description = rest.join(' — ');
  return (
    <li className="flex items-center gap-3">
      <kbd
        className="text-tiny font-medium"
        style={{
          background: 'var(--surface-mist)',
          border: '1px solid var(--line)',
          padding: '2px 8px',
          borderRadius: 6,
          fontFamily: 'inherit',
        }}
      >
        {chord}
      </kbd>
      <span style={{ color: 'var(--text-soft)' }}>{description}</span>
    </li>
  );
}
