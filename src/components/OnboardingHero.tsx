/**
 * First-run onboarding hero — shown on the dashboard when the workspace
 * is empty (no tasks AND no projects). Persists dismissal via localStorage
 * so a returning user who explicitly empties their workspace doesn't keep
 * seeing it.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mascot } from './Mascot';

const DISMISS_KEY = 'reflect.onboarding.dismissed.v1';

const STEPS = [
  { to: '/layihelər', label: '1. Layihə yarat' },
  { to: '/tapşırıqlar', label: '2. Tapşırıq əlavə et' },
  { to: '/komanda/heyət', label: '3. Komandaya dəvət göndər' },
  { to: '/mirai', label: '4. MIRAI-dən soruş' },
];

export function OnboardingHero({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (!visible || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore quota / private mode
    }
  }

  return (
    <section
      className="card-feature mb-5 flex flex-wrap items-center gap-6"
      role="region"
      aria-label="İlk addımlar"
    >
      <Mascot size={96} decorative={false} label="Reflect-ə xoş gəlmisən" />
      <div className="min-w-0 flex-1">
        <div
          className="text-tiny font-medium"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Reflect-ə xoş gəlmisən
        </div>
        <h2 className="text-h2 mt-1" style={{ color: 'var(--ink)' }}>
          Studiyanı 4 addımda işə sal
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <li key={s.to}>
              <Link
                to={s.to}
                className="chip"
                style={{ background: 'rgba(14,22,17,0.08)', color: 'var(--ink)' }}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="text-meta"
        style={{ color: 'var(--ink)', opacity: 0.6 }}
        aria-label="Onboarding bağla"
      >
        Bağla
      </button>
    </section>
  );
}
