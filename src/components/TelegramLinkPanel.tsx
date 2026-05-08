/**
 * Telegram linking panel — US-TG-01.
 *
 * Acceptance criteria from PRD:
 *   - Click "Telegram-ı qoş" → 6-digit code generated, TTL 10 min
 *   - Deep link to the Reflect bot opens with the code prefilled
 *   - After /start <code> in the bot, telegram_chat_id is saved
 *   - Status flips to "Qoşulub"
 *
 * The /api/telegram/init endpoint is requireUser-guarded, so we MUST send
 * the bearer token. The existing route returns the 6-char code in
 * uppercase; we pass it as the deep-link `start` parameter so the bot
 * receives `/start <code>` automatically when the user taps the link.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

export function TelegramLinkPanel() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';
  const deepLink = code && botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

  // Fresh profile lookup; the auth store's profile is loaded once at signin.
  const me = useQuery({
    queryKey: ['profile', 'self', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, telegram_chat_id, telegram_linked_at')
        .eq('id', profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const linked = !!me.data?.telegram_chat_id;

  // While a code is active and we're not linked yet, poll every 3s.
  // The webhook flips telegram_chat_id on the user's row; this catches it.
  const pollTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!code || linked) return;
    pollTimer.current = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ['profile', 'self'] });
    }, 3000);
    return () => {
      if (pollTimer.current != null) window.clearInterval(pollTimer.current);
    };
  }, [code, linked, qc]);

  // Linked → drop the code (the user is done) and stop polling.
  useEffect(() => {
    if (linked) setCode(null);
  }, [linked]);

  async function getCode() {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı');
      const res = await fetch('/api/telegram/init', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok || !json.code) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCode(json.code);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-h3">Telegram</h3>
        <span
          className="chip"
          style={{
            background: linked ? 'rgba(173,251,73,0.16)' : 'rgba(255,255,255,0.04)',
            color: linked ? 'var(--brand-text)' : 'var(--text-muted)',
          }}
        >
          {linked ? 'Qoşulub' : 'Qoşulmayıb'}
        </span>
      </div>

      <p className="text-body">
        Reflect botunu Telegram-da aç və göndər <code>/start &lt;kod&gt;</code> mesajını. Bot
        tapşırıq deadline-ları və mention-lar haqqında bildiriş yollayacaq.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={getCode}
          disabled={busy}
        >
          {busy ? 'Yaradılır…' : linked ? 'Yeni kod yarat' : 'Bağlanma kodunu al'}
        </button>
        {code ? (
          <>
            <code
              className="px-3 py-2 rounded-btn text-h3"
              style={{
                background: 'var(--ink)',
                color: 'var(--brand-action)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.1em',
              }}
            >
              {code}
            </code>
            {deepLink ? (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline"
              >
                Botu aç →
              </a>
            ) : null}
          </>
        ) : null}
      </div>

      {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
      {code && !linked ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Kodu botda göndər; bu səhifə avtomatik yenilənəcək. Kodun ömrü ~10 dəqiqədir.
        </p>
      ) : null}
      {linked ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Bağlandı: {me.data?.telegram_chat_id} ·{' '}
          {me.data?.telegram_linked_at
            ? new Date(me.data.telegram_linked_at).toLocaleDateString('az-Latn-AZ')
            : ''}
        </p>
      ) : null}
    </div>
  );
}
