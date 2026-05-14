/**
 * REQ-FOCUS-01..06 — personal Pomodoro timer with mascot growth.
 * State persists in localStorage; cloud sync via focus_sessions table.
 * PRD:796 — ambient sounds (white/pink/brown noise via Web Audio API).
 * PRD:796 — multi-device resume: detects last active session on load.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mascot } from './Mascot';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

const PRESETS = [
  { work: 25, brk: 5 },
  { work: 40, brk: 20 }, // default
  { work: 50, brk: 10 },
  { work: 90, brk: 15 },
];
const KEY = 'reflect.focus';

type Phase = 'idle' | 'work' | 'break';
type Saved = { phase: Phase; endsAt: number; preset: number };
type Sound = 'off' | 'white' | 'pink' | 'brown';

const SOUND_LABELS: Record<Sound, string> = {
  off: 'Səssiz',
  white: 'Ağ səs',
  pink: 'Çəhrayı səs',
  brown: 'Dərin səs',
};

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

// Web Audio API noise generators — no external files needed
function createNoiseSource(ctx: AudioContext, kind: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const bufLen = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);

  if (kind === 'white') {
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // brown noise — integrate white noise
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function useAmbientSound() {
  const [sound, setSound] = useState<Sound>('off');
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  function stopCurrent() {
    if (gainRef.current && ctxRef.current) {
      gainRef.current.gain.setTargetAtTime(0, ctxRef.current.currentTime, 0.3);
    }
    setTimeout(() => {
      try { srcRef.current?.stop(); } catch { /* already stopped */ }
      srcRef.current = null;
    }, 400);
  }

  function switchSound(next: Sound) {
    stopCurrent();
    setSound(next);
    if (next === 'off') return;

    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume();

    const src = createNoiseSource(ctx, next);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    gain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.5);
    srcRef.current = src;
    gainRef.current = gain;
  }

  useEffect(() => () => {
    try { srcRef.current?.stop(); } catch { /* ok */ }
    ctxRef.current?.close();
  }, []);

  return { sound, switchSound };
}

export function FocusWidget({ className = '' }: { className?: string }) {
  const { profile } = useAuth();
  const [preset, setPreset] = useState(1); // 40/20 default
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(PRESETS[1].work * 60);
  const tickRef = useRef<number | null>(null);
  const sessionStartRef = useRef<string | null>(null);
  const sessionStageRef = useRef<number>(1);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const { sound, switchSound } = useAmbientSound();

  // PRD:796 — multi-device: detect last unsynced session from cloud
  const lastSession = useQuery({
    queryKey: ['focus-last-session', profile?.id],
    enabled: !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('focus_sessions')
        .select('started_at, planned_minutes, mascot_stage, interrupted')
        .eq('user_id', profile!.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Restore localStorage session on mount
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
            syncSession(new Date().toISOString(), false, sessionStageRef.current);
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

  async function syncSession(completedAt: string, interrupted: boolean, mascotStage: number) {
    if (!profile || !sessionStartRef.current) return;
    await supabase.from('focus_sessions').insert({
      user_id: profile.id,
      started_at: sessionStartRef.current,
      planned_minutes: PRESETS[preset].work,
      completed_at: completedAt,
      interrupted,
      mascot_stage: mascotStage,
    });
    sessionStartRef.current = null;
  }

  function start(overridePreset?: number) {
    const p = overridePreset ?? preset;
    if (overridePreset !== undefined) setPreset(p);
    const total = PRESETS[p].work * 60;
    const endsAt = Date.now() + total * 1000;
    localStorage.setItem(KEY, JSON.stringify({ phase: 'work', endsAt, preset: p }));
    sessionStartRef.current = new Date().toISOString();
    setPhase('work');
    setRemaining(total);
    setResumeDismissed(true);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function stop() {
    if (phase === 'work') {
      syncSession(new Date().toISOString(), true, sessionStageRef.current);
    }
    localStorage.removeItem(KEY);
    setPhase('idle');
    setRemaining(PRESETS[preset].work * 60);
  }

  const total =
    phase === 'break' ? PRESETS[preset].brk * 60 : PRESETS[preset].work * 60;
  const pct = phase === 'idle' ? 0 : Math.max(0, Math.min(1, 1 - remaining / total));
  const stage = Math.min(4, Math.max(1, 1 + Math.floor(pct * 4)));
  sessionStageRef.current = stage;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  // Show multi-device resume banner only when idle, localStorage empty, and there was a recent session
  const localSession = load();
  const showResumeBanner =
    !resumeDismissed &&
    phase === 'idle' &&
    !localSession &&
    !!lastSession.data &&
    (() => {
      const ago = Date.now() - new Date(lastSession.data.started_at).getTime();
      return ago < 8 * 3_600_000; // within 8 hours
    })();

  const ls = lastSession.data;

  return (
    <section className={`card flex flex-col gap-4 ${className}`}>
      {/* Multi-device resume banner (PRD:796) */}
      {showResumeBanner && ls ? (
        <div
          className="rounded-card px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--brand-glow-sm)', border: '1px solid var(--brand-glow-xl)' }}
        >
          <span className="text-meta" style={{ color: 'var(--brand-text)' }}>
            Son seans: {ls.planned_minutes} dəq · Səviyyə {ls.mascot_stage}/4
            {ls.interrupted ? ' (yarımçıq)' : ' (tamamlandı)'}
          </span>
          <div className="flex gap-2">
            <button
              className="chip"
              style={{ background: 'var(--brand-action)', color: 'var(--ink)', fontWeight: 600 }}
              onClick={() => {
                const idx = PRESETS.findIndex((p) => p.work === ls.planned_minutes);
                start(idx >= 0 ? idx : undefined);
              }}
            >
              Yenidən başla
            </button>
            <button
              className="chip"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
              onClick={() => setResumeDismissed(true)}
            >
              Keç
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-5">
        {/* Ring timer */}
        <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
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
          {/* Preset chips */}
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
          {/* Start/Stop */}
          <div className="mt-3">
            {phase === 'idle' ? (
              <button className="btn-primary" onClick={() => start()}>
                Başla
              </button>
            ) : (
              <button className="btn-outline" onClick={stop}>
                Dayan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ambient sound picker (PRD:796) */}
      <div className="flex items-center gap-2 flex-wrap" style={{ paddingTop: 8, borderTop: '1px solid var(--line-soft)' }}>
        <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Fon səsi:</span>
        {(['off', 'white', 'pink', 'brown'] as Sound[]).map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            style={{
              background: sound === s ? 'var(--brand-glow-xl)' : 'rgba(255,255,255,0.04)',
              color: sound === s ? 'var(--brand-text)' : 'var(--text-muted)',
              border: `1px solid ${sound === s ? 'var(--brand-glow-ring)' : 'rgba(255,255,255,0.08)'}`,
              fontSize: 12,
            }}
            onClick={() => switchSound(s)}
          >
            {SOUND_LABELS[s]}
          </button>
        ))}
      </div>
    </section>
  );
}
