import { FormEvent, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Mascot } from '@/components/Mascot';
import { useAuth } from '@/lib/store';
import { sendMagicLink, sendPasswordReset, signInWithPassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const { session, hydrated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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
    setErr(null);
    setInfo(null);
    setBusy(true);
    const { error } = await signInWithPassword(email, password);
    if (error) {
      setBusy(false);
      setErr('Email və ya şifrə yanlışdır.');
      return;
    }
    if (inviteToken) await acceptInvite(inviteToken);
    setBusy(false);
  }

  async function onMagic() {
    setErr(null);
    setBusy(true);
    const { error } = await sendMagicLink(email);
    setBusy(false);
    setInfo('Əgər bu email Reflect-də qeydiyyatdadırsa, linki göndərdik.');
    if (error && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şifrə</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {err ? <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{err}</p> : null}
          {info ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{info}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            Daxil ol
          </button>
          <button type="button" className="btn-ghost w-full" onClick={onMagic} disabled={busy || !email}>
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
