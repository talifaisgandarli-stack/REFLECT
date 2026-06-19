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

type InviteInfo = { email: string; role_name: string | null; expires_at: string };

export function LoginPage() {
  const { session, hydrated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
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
  // Invitation metadata fetched by /api/invitations/info — lets the signup
  // form confirm WHICH email + role the invitee is about to claim before
  // they pick a password. Null while loading; error string surfaces 4xx/5xx.
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteInfoError, setInviteInfoError] = useState<string | null>(null);

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

  // Fetch invite info as soon as the page lands with ?invite=. Doing this
  // up-front means the form can show "Hesab: x@y.com · Rol: Admin" before
  // the invitee types anything; if the token is bad we say so once,
  // instead of letting them craft a password then bounce on submit.
  useEffect(() => {
    if (!inviteToken) {
      setInviteInfo(null);
      setInviteInfoError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/info?token=${encodeURIComponent(inviteToken)}`);
        const body = (await res.json().catch(() => ({}))) as
          | InviteInfo
          | { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setInviteInfoError(
            ('error' in body && body.error) || 'Dəvət linki keçərsizdir',
          );
          return;
        }
        setInviteInfo(body as InviteInfo);
      } catch (e) {
        if (!cancelled) setInviteInfoError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

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

  // Signup-via-invite path. Calls /api/invitations/signup which creates the
  // Supabase Auth user with the chosen password + attaches the role from
  // the invite + marks the invite accepted. Then we sign in client-side
  // with the same credentials to get a real session — the backend can't
  // mint one for us because Supabase admin.createUser returns a user, not
  // a session.
  async function onInviteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inviteToken || !inviteInfo) return;
    setErr(null);
    setInfo(null);
    if (password.length < 8) {
      setErr('Şifrə ən az 8 simvol olmalıdır.');
      return;
    }
    if (password !== passwordConfirm) {
      setErr('Şifrələr uyğun gəlmir.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/invitations/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string };
      if (!res.ok) {
        setErr(body.error ?? 'Hesab yaradılmadı');
        setBusy(false);
        return;
      }
      // Sign in with the email returned by the backend (avoids a typo
      // mismatch with whatever the invitee might re-type) + the password
      // they just set. Once signed in, the App routing takes them to /
      // because <Navigate to="/" replace /> fires above.
      const { error: signInErr } = await signInWithPassword(body.email!, password);
      if (signInErr) {
        setErr('Hesab yaradıldı, lakin avtomatik daxil olunmadı. Şifrə ilə login formundan daxil ol.');
        setBusy(false);
        return;
      }
      // Strip ?invite= from URL so reloads don't try to re-accept the
      // now-consumed token.
      setSearchParams((p) => { p.delete('invite'); return p; }, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
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

  // Two distinct UIs:
  //   - ?invite=<token> present + valid → signup form (just password + confirm)
  //   - everything else                → regular login (email + password)
  // Splitting at the form level keeps the cognitive load on whichever
  // flow the user actually landed in.
  const inviteMode = !!inviteToken;

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

        {inviteMode ? (
          inviteInfoError ? (
            // Bad token — surface the backend's reason ("Dəvət tapılmadı",
            // "müddəti bitib", etc.) so admin can re-issue.
            <div
              className="rounded-card px-3 py-3 text-meta"
              style={{
                background: 'rgba(217, 119, 6, 0.10)',
                border: '1px solid rgba(217, 119, 6, 0.35)',
                color: 'var(--error-deep)',
              }}
            >
              ⚠ {inviteInfoError}
              <div className="mt-2" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Yeni dəvət üçün admin ilə əlaqə saxla.
              </div>
            </div>
          ) : !inviteInfo ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Dəvət yoxlanılır…
            </p>
          ) : (
            <>
              <div
                className="rounded-card px-3 py-3 mb-3 text-meta"
                style={{
                  background: 'var(--brand-glow-sm)',
                  color: 'var(--brand-text)',
                  border: '1px solid var(--brand-glow-md)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  ✉ Reflect-ə xoş gəldin
                </div>
                <div style={{ fontSize: 12 }}>
                  Hesab: <strong>{inviteInfo.email}</strong>
                  {inviteInfo.role_name ? (
                    <>
                      {' · '}Rol: <strong>{inviteInfo.role_name}</strong>
                    </>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>
                  Aşağıda şifrə yarat, hesabın bir kliklə açılacaq.
                </div>
              </div>

              <form onSubmit={onInviteSubmit} className="space-y-3">
                <label className="block">
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şifrə (ən az 8 simvol)</span>
                  <div className="relative mt-1">
                    <input
                      required
                      minLength={8}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      autoFocus
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
                <label className="block">
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şifrəni təsdiqlə</span>
                  <input
                    required
                    minLength={8}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="input mt-1"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </label>
                {err ? (
                  <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{err}</p>
                ) : null}
                <button type="submit" className="btn-primary w-full" disabled={busy}>
                  {busy ? 'Hesab yaradılır…' : 'Hesab yarat və daxil ol'}
                </button>
              </form>
            </>
          )
        ) : (
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
        )}

        <div className="flex flex-col items-center mt-6">
          <Mascot size={128} decorative={false} label="Reflect mascot" />
          <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
            {inviteMode
              ? 'Bu dəvət linki səxsi və 48 saat keçərlidir.'
              : 'İlk dəfə? Admin sizi dəvət etməlidir.'}
          </p>
        </div>
      </div>
    </div>
  );
}
