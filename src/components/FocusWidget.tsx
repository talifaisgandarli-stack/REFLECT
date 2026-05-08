/**
 * REQ-FOCUS-01..06 — personal Pomodoro timer with mascot growth.
 * State persists in localStorage; cloud sync via focus_sessions table is opt-in.
 */
import { useEffect, useRef, useState } from 'react';
import { Mascot } from './Mascot';

const PRESETS = [
  { work: 25, brk: 5 },
  { work: 40, brk: 20 }, // default
  { work: 50, brk: 10 },
  { work: 90, brk: 15 },
];
const KEY = 'reflect.focus';

type Phase = 'idle' | 'work' | 'break';

type Saved = { phase: Phase; endsAt: number; preset: number };

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function FocusWidget({ className = '' }: { className?: string }) {
  const [preset, setPreset] = useState(1); // 40/20 default
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(PRESETS[1].work * 60);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const s = load();
    if (s && s.phase !== 'idle') {
      const remain = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
      setPreset(s.preset);
      setPhase(s.phase);
      setRemaining(remain);
    }
  }, []);

  useEffect(() => {
    if (phase === 'idle') return;
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(tickRef.current!);
          if (phase === 'work') {
            const next = PRESETS[preset].brk * 60;
            const endsAt = Date.now() + next * 1000;
            localStorage.setItem(KEY, JSON.stringify({ phase: 'break', endsAt, preset }));
            setPhase('break');
            try {
              new Notification('İş seansı tamamlandı', { body: 'Fasilə vaxtı.' });
            } catch {
              /* permissions */
            }
            return next;
          }
          localStorage.removeItem(KEY);
          setPhase('idle');
          return PRESETS[preset].work * 60;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [phase, preset]);

  function start() {
    const total = PRESETS[preset].work * 60;
    const endsAt = Date.now() + total * 1000;
    localStorage.setItem(KEY, JSON.stringify({ phase: 'work', endsAt, preset }));
    setPhase('work');
    setRemaining(total);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
  function stop() {
    localStorage.removeItem(KEY);
    setPhase('idle');
    setRemaining(PRESETS[preset].work * 60);
  }

  const total =
    phase === 'break' ? PRESETS[preset].brk * 60 : PRESETS[preset].work * 60;
  const pct = phase === 'idle' ? 0 : Math.max(0, Math.min(1, 1 - remaining / total));
  const stage = Math.min(4, Math.max(1, 1 + Math.floor(pct * 4)));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <section className={`card flex items-center gap-5 ${className}`}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <svg width={96} height={96} viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="42" fill="none" stroke="var(--line)" strokeWidth="4" />
          <circle
            cx="48"
            cy="48"
            r="42"
            fill="none"
            stroke="var(--brand-action)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            strokeDashoffset={2 * Math.PI * 42 * (1 - pct)}
            transform="rotate(-90 48 48)"
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-h3"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {phase === 'idle' ? `${PRESETS[preset].work}:00` : `${mm}:${ss}`}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Mascot size={Math.min(64, 32 + stage * 8)} />
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Səviyyə {stage}/4
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`chip ${i === preset ? 'chip-brand' : ''}`}
              onClick={() => phase === 'idle' && setPreset(i)}
              disabled={phase !== 'idle'}
            >
              {p.work}/{p.brk}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {phase === 'idle' ? (
            <button className="btn-primary" onClick={start}>
              Başla
            </button>
          ) : (
            <button className="btn-outline" onClick={stop}>
              Dayan
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
