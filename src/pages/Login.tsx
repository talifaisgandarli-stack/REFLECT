import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mascot } from '@/components/Mascot';
import { useAuth } from '@/lib/store';
import { sendMagicLink, signInWithPassword } from '@/lib/auth';

export function LoginPage() {
  const { session, hydrated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  if (!hydrated) return null;
  if (session) return <Navigate to="/" replace />;

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
          {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
          {info ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{info}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            Daxil ol
          </button>
          <button type="button" className="btn-ghost w-full" onClick={onMagic} disabled={busy || !email}>
            Magic link göndər
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
