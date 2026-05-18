import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Mascot } from '@/components/Mascot';
import { useAuth } from '@/lib/store';
import { sendMagicLink, sendPasswordReset, signInWithPassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LoginPage() {
  const { session, hydrated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // PRD §UX — warn user when Caps Lock is on while typing password; common
  // source of "wrong password" frustration that drives lockouts.
  const [capsLock, setCapsLock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  // PRD §REQ-AUTH-01 — visible countdown when locked out (429 from rate-check)
  const [lockedUntilTs, setLockedUntilTs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick once a second while locked so the countdown updates live.
  useEffect(() => {
    if (!lockedUntilTs) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntilTs) {
        setLockedUntilTs(null);
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockedUntilTs]);

  const lockedSecondsLeft = lockedUntilTs ? Math.max(0, Math.ceil((lockedUntilTs - now) / 1000)) : 0;
  const isLocked = lockedSecondsLeft > 0;

  if (!hydrated) return null;
  if (session) return <Navigate to="/" replace />;

  async function acceptInvite(token: string) {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) return;
    await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token }),
    });
    // Remove invite param from URL regardless of accept result (idempotent).
    setSearchParams((p) => { p.delete('invite'); return p; }, { replace: true });
  }

  // PRD §5 / OWASP — never echo Supabase auth errors verbatim. Distinct
  // messages for "user not found" vs. "wrong password" let an attacker
  // enumerate which emails have accounts. Collapse everything to one generic
  // string; the user can still tell on the next attempt with correct creds.
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLocked) return; // belt-and-suspenders against rapid Enter presses
    setErr(null);
    setInfo(null);
    setBusy(true);
    const { error } = await signInWithPassword(email, password);
    if (error) {
      setBusy(false);
      // Detect 429 from rate-check and start the countdown
      const e429 = error as { status?: number; retryAfterSeconds?: number; message?: string };
      if (e429?.status === 429 && e429.retryAfterSeconds) {
        setLockedUntilTs(Date.now() + e429.retryAfterSeconds * 1000);
        setErr(e429.message ?? 'Çox sayda cəhd. Gözləyin.');
      } else {
        setErr('Email və ya şifrə yanlışdır.');
      }
      return;
    }
    if (inviteToken) await acceptInvite(inviteToken);
    setBusy(false);
  }

  async function onMagic() {
    setErr(null);
    // PRD §AUTH — basic guard so users don't fire an empty/invalid send.
    // Server still validates; this is just to surface the issue inline.
    if (!email.trim()) {
      setErr('Əvvəlcə email daxil et.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('Email düzgün formatda olmalıdır.');
      return;
    }
    setBusy(true);
    const { error } = await sendMagicLink(email);
    setBusy(false);
    setInfo('Əgər bu email Reflect-də qeydiyyatdadırsa, linki göndərdik. Mailbox-u (və Spam qovluğunu) yoxla.');
    if (error && import.meta.env.DEV) {
      console.warn('[magic-link]', error.message);
    }
  }

  async function onReset() {
    if (!email) {
      setErr('Email daxil et.');
      return;
    }
    setErr(null);
    setBusy(true);
    const { error } = await sendPasswordReset(email);
    setBusy(false);
    setInfo('Əgər bu email qeydiyyatdadırsa, şifrə bərpa linki göndərdik.');
    if (error && import.meta.env.DEV) {
      console.warn('[password-reset]', error.message);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4">
      <div
        aria-hidden
        className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--brand-glow-hero) 0%, var(--brand-glow-zero) 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="card relative z-10 w-full max-w-[400px]"
        style={{ padding: 40, borderRadius: 18, boxShadow: '0 24px 64px rgba(14,22,17,0.08)' }}
      >
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand-text)' }}
          >
            <span className="text-h2" style={{ color: 'var(--brand-action)' }}>R</span>
          </div>
          <span className="text-h2 font-bold" style={{ color: 'var(--brand-text)' }}>
            Reflect
          </span>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              autoFocus
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şifrə</span>
            <div className="relative mt-1">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="input w-full pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => setCapsLock(e.getModifierState && e.getModifierState('CapsLock'))}
                onKeyUp={(e) => setCapsLock(e.getModifierState && e.getModifierState('CapsLock'))}
                onBlur={() => setCapsLock(false)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-meta opacity-60 hover:opacity-100"
                style={{ color: 'var(--text-muted)' }}
                aria-label={showPassword ? 'Şifrəni gizlət' : 'Şifrəni göstər'}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {capsLock ? (
              <p
                className="text-meta mt-1"
                style={{ color: 'var(--warning, #c47d00)' }}
                role="status"
              >
                ⚠ Caps Lock açıqdır
              </p>
            ) : null}
          </label>
          {/* PRD §REQ-AUTH-01 — visible lockout countdown after 429 */}
          {isLocked ? (
            <div
              role="alert"
              className="rounded-card px-3 py-2 text-meta"
              style={{
                background: 'rgba(217, 119, 6, 0.12)',
                border: '1px solid rgba(217, 119, 6, 0.4)',
                color: 'var(--warning, #c47d00)',
              }}
            >
              <div className="flex items-center justify-between">
                <span>{err ?? 'Çox sayda cəhd. Gözləyin.'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatCountdown(lockedSecondsLeft)}
                </span>
              </div>
              {/* PRD §AUTH — helper hints so user has options instead of just waiting */}
              <div className="mt-2" style={{ fontSize: 11, opacity: 0.9 }}>
                Şifrəni unutmusan?{' '}
                <button
                  type="button"
                  className="underline"
                  style={{ color: 'inherit' }}
                  onClick={onReset}
                >
                  Bərpa et
                </button>
                {' · '}
                <button
                  type="button"
                  className="underline"
                  style={{ color: 'inherit' }}
                  onClick={onMagic}
                >
                  Magic link al
                </button>
              </div>
            </div>
          ) : err ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{err}</p>
          ) : null}
          {info ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{info}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={busy || isLocked}>
            {isLocked ? `Daxil ol (${formatCountdown(lockedSecondsLeft)})` : 'Daxil ol'}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={onMagic} disabled={busy || !email || isLocked}>
            Magic link göndər
          </button>
          <button
            type="button"
            className="text-meta w-full text-center hover:underline pt-1"
            style={{ color: 'var(--text-muted)', background: 'transparent' }}
            onClick={onReset}
            disabled={busy}
          >
            Şifrəni unutmusan?
          </button>
        </form>
        <div className="flex flex-col items-center mt-6">
          <Mascot size={128} decorative={false} label="Reflect mascot" />
          <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
            İlk dəfə? Admin sizi dəvət etməlidir.
          </p>
        </div>
      </div>
    </div>
  );
}
