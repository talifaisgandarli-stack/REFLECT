import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// PRD §8.1 / US-TG-01 — set VITE_TELEGRAM_BOT_USERNAME in .env to enable deep link
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

export function TelegramLinkPage() {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getCode() {
    setBusy(true);
    setError(null);
    setCode(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı — yenidən daxil ol.');
      const res = await fetch('/api/telegram/init', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Xəta (${res.status})`);
      setCode(data?.code ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const deepLink = code && BOT_USERNAME
    ? `https://t.me/${BOT_USERNAME}?start=${code}`
    : null;

  return (
    <>
      <PageHead meta="Şəxsi" title="Telegram bağlantısı" />
      <div className="card max-w-2xl space-y-5">
        <p className="text-body">
          Reflect botunu Telegram-da aç və aşağıdakı kodu göndər. Bot tapşırıq, mention
          və maliyyə xəbərdarlıqları haqqında bildiriş göndərəcək.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-primary" onClick={getCode} disabled={busy}>
            {busy ? 'Yüklənir…' : profile?.telegram_chat_id ? 'Yeni kod yarat' : 'Bağlanma kodunu al'}
          </button>
          {code ? (
            <code
              className="px-3 py-2 rounded-btn text-h3"
              style={{
                background: 'var(--ink)',
                color: 'var(--brand-action)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.15em',
              }}
            >
              {code}
            </code>
          ) : null}
        </div>

        {code ? (
          <div className="rounded-card p-4 space-y-3" style={{ background: 'var(--surface-mist)' }}>
            {deepLink ? (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex items-center gap-2"
              >
                Bota keç → kod avtomatik göndərilir
              </a>
            ) : (
              <p className="text-body">
                Telegram-da Reflect botunu tap və bu kodu göndər:{' '}
                <strong>/start {code}</strong>
              </p>
            )}
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Kod 10 dəqiqə ərzində etibarlıdır.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="text-meta" style={{ color: '#B91C1C' }}>{error}</p>
        ) : null}

        <div className="text-meta" style={{ color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--line-soft)' }}>
          {profile?.telegram_chat_id
            ? `Bağlıdır ✓ — chat ID: ${profile.telegram_chat_id}`
            : 'Hələ bağlı deyil.'}
        </div>
      </div>
    </>
  );
}
