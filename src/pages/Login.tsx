import { FormEvent, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Mascot } from '@/components/Mascot';
import { useAuth } from '@/lib/store';
import { sendMagicLink, signInWithPassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const { session, hydrated } = useAuth();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');

  if (!hydrated) return null;
  if (session && !inviteToken) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4">
      <div
        aria-hidden
        className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(173,251,73,0.55) 0%, rgba(173,251,73,0) 70%)',
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

        {inviteToken ? <AcceptInviteForm token={inviteToken} /> : <SignInForm />}

        <div className="flex flex-col items-center mt-6">
          <Mascot size={128} decorative={false} label="Reflect mascot" />
          {!inviteToken ? (
            <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
              İlk dəfə? Admin sizi dəvət etməlidir.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    const { error } = await signInWithPassword(email, password);
    setBusy(false);
    if (error) setErr(error.message);
  }

  async function onMagic() {
    setErr(null);
    setBusy(true);
    const { error } = await sendMagicLink(email);
    setBusy(false);
    if (error) setErr(error.message);
    else setInfo('Linki email-də yoxla.');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Email">
        <input
          required
          type="email"
          autoComplete="email"
          className="input mt-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Şifrə">
        <input
          required
          type="password"
          autoComplete="current-password"
          className="input mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
      {info ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{info}</p> : null}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        Daxil ol
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onMagic} disabled={busy || !email}>
        Magic link göndər
      </button>
    </form>
  );
}

/**
 * REQ-AUTH-02 — accept-mode form. Hits public /api/invitations/accept with
 * the token + chosen password, then signs the user in with the same password.
 */
function AcceptInviteForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr('Şifrə ən azı 8 simvol olmalıdır.');
      return;
    }
    if (password !== confirm) {
      setErr('Şifrələr uyğun gəlmir.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, full_name: fullName || null }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
      if (!res.ok || !json.email) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: json.email,
        password,
      });
      if (signInErr) throw new Error(signInErr.message);
      window.location.href = '/';
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-body" style={{ color: 'var(--text-soft)' }}>
        Dəvətnaməni qəbul etmək üçün şifrə təyin et.
      </p>
      <Field label="Tam ad">
        <input
          type="text"
          autoComplete="name"
          className="input mt-1"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </Field>
      <Field label="Şifrə (≥8)">
        <input
          required
          type="password"
          autoComplete="new-password"
          minLength={8}
          className="input mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Şifrəni təkrarla">
        <input
          required
          type="password"
          autoComplete="new-password"
          minLength={8}
          className="input mt-1"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? 'Yaradılır…' : 'Hesabı yarat və daxil ol'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}
