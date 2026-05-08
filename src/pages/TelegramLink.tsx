import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { useState } from 'react';

export function TelegramLinkPage() {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  async function getCode() {
    setBusy(true);
    try {
      const res = await fetch('/api/telegram/init', { method: 'POST' });
      const data = await res.json().catch(() => null);
      setCode(data?.code ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead meta="Şəxsi" title="Telegram bağlantısı" />
      <div className="card max-w-2xl">
        <p className="text-body">
          Reflect botunu Telegram-da aç və aşağıdakı kodu göndər. Bot tapşırıq, mention və müştəri qeydləri haqqında bildiriş göndərəcək.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={getCode} disabled={busy}>
            {profile?.telegram_chat_id ? 'Yeni kod yarat' : 'Bağlanma kodunu al'}
          </button>
          {code ? (
            <code
              className="px-3 py-2 rounded-btn text-h3"
              style={{
                background: 'var(--ink)',
                color: 'var(--brand-action)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {code}
            </code>
          ) : null}
        </div>
        <div className="text-meta mt-4" style={{ color: 'var(--text-muted)' }}>
          {profile?.telegram_chat_id
            ? `Bağlıdır: ${profile.telegram_chat_id}`
            : 'Hələ bağlı deyil.'}
        </div>
      </div>
    </>
  );
}
