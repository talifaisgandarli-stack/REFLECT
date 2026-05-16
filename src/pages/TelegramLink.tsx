import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';

// PRD §8.1 — bot username for deep linking. Fallback to env-injected value at build time.
const BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? 'ReflectStudioBot';

export function TelegramLinkPage() {
  const { profile, setProfile, role } = useAuth();
  const [busy, setBusy] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

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

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard errors (secure context required) */
    }
  }

  // PRD §8.1 — clear telegram_chat_id + telegram_linked_at to revoke bot access
  async function unlink() {
    if (!profile?.id) return;
    setUnlinking(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ telegram_chat_id: null, telegram_linked_at: null })
        .eq('id', profile.id);
      if (error) throw error;
      // Reflect change locally so the UI updates immediately
      setProfile({ ...profile, telegram_chat_id: null, telegram_linked_at: null }, role);
      setConfirmUnlink(false);
    } finally {
      setUnlinking(false);
    }
  }

  // PRD §8.1 — `t.me/<bot>?start=<code>` opens the chat with `/start <code>`
  // pre-loaded; the webhook then links chat_id ↔ profile automatically.
  const deepLink = code ? `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(code)}` : null;

  return (
    <>
      <PageHead meta="Şəxsi" title="Telegram bağlantısı" />
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-3 text-meta" style={{ color: 'var(--text-muted)' }}>
          <span>Bot:</span>
          <code style={{ background: 'var(--surface-mist)', padding: '2px 8px', borderRadius: 6, color: 'var(--brand-text)', fontVariantNumeric: 'tabular-nums' }}>
            @{BOT_USERNAME}
          </code>
        </div>
        <p className="text-body">
          Bot tapşırıq, mention və müştəri qeydləri haqqında bildiriş göndərəcək.
          Aşağıdakı düyməni bas və Telegram-da açılan pəncərədə <strong>Start</strong> bölməsinə klik et.
        </p>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button className="btn-primary" onClick={getCode} disabled={busy}>
            {busy ? 'Yaradılır…' : profile?.telegram_chat_id ? 'Yeni kod yarat' : 'Bağlanma kodunu al'}
          </button>

          {code && deepLink ? (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ background: '#229ED9', color: 'white' }}
            >
              Telegram-da aç →
            </a>
          ) : null}

          {code ? (
            <button
              type="button"
              className="px-3 py-2 rounded-btn text-h3 hover:opacity-80"
              style={{
                background: 'var(--ink)',
                color: 'var(--brand-action)',
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
              }}
              onClick={copyCode}
              title="Kodu kopyala"
            >
              {copied ? 'Kopyalandı ✓' : code}
            </button>
          ) : null}
        </div>

        {code ? (
          <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
            Kod 10 dəqiqə etibarlıdır. Əgər düymə işləmirsə, kodu kopyalayıb Telegram-da bota
            <code className="mx-1" style={{ background: 'var(--brand-glow-sm)', padding: '1px 4px', borderRadius: 4 }}>/start &lt;kod&gt;</code>
            şəklində göndər.
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {profile?.telegram_chat_id
              ? `Bağlıdır: ${profile.telegram_chat_id}`
              : 'Hələ bağlı deyil.'}
          </div>
          {profile?.telegram_chat_id ? (
            confirmUnlink ? (
              <div className="flex items-center gap-2">
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Əminsən?</span>
                <button
                  type="button"
                  className="chip"
                  style={{ background: 'var(--error-deep)', color: 'white' }}
                  disabled={unlinking}
                  onClick={unlink}
                >
                  {unlinking ? 'Silinir…' : 'Bəli, sil'}
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setConfirmUnlink(false)}
                  disabled={unlinking}
                >
                  Ləğv
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="chip"
                style={{ color: 'var(--error-deep)' }}
                onClick={() => setConfirmUnlink(true)}
              >
                Bağlantını sil
              </button>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
