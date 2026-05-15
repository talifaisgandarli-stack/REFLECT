/**
 * Telegram bot webhook. Verifies secret_token, then handles bot commands.
 * Configure: BotFather → setWebhook to https://<your-domain>/api/telegram/webhook with secret_token.
 *
 * Security: TELEGRAM_WEBHOOK_SECRET MUST be configured. If absent, the handler
 * fails closed (returns 500) — previously this fell through and let any caller
 * POST forged updates.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

type TgMessage = {
  message?: { chat: { id: number }; text?: string };
};

const HELP_TEXT = [
  'Reflect Telegram bot komandaları:',
  '',
  '/start <kod> — hesabını bağla (kod Reflect-də Telegram səhifəsindən)',
  '/status — bağlantı vəziyyətini göstər',
  '/unlink — Telegram bağlantısını sil',
  '/help — bu mesajı göstər',
].join('\n');

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    // Fail-closed: secret MUST be configured. Anyone could otherwise forge updates.
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) throw new HttpError(500, 'TELEGRAM_WEBHOOK_SECRET not configured');
    if (req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
      throw new HttpError(401, 'Bad secret');
    }

    const update = (await req.json()) as TgMessage;
    const text = (update.message?.text ?? '').trim();
    const chatId = update.message?.chat.id;
    if (!chatId) return jsonResponse({ ok: true });

    const sb = admin();

    // /start <code> — bind chat_id to a user
    const start = text.match(/^\/start\s+(\d{6})\b/);
    if (start) {
      const code = start[1];
      const { data: row } = await sb
        .from('telegram_link_codes')
        .select('user_id, expires_at')
        .eq('code', code)
        .maybeSingle();
      if (!row || new Date(row.expires_at).getTime() < Date.now()) {
        await sendMessage(chatId, 'Kod yanlış və ya vaxtı keçmişdir. Yenisini Reflect-dən al.');
        // Clean up expired row if it exists.
        if (row) await sb.from('telegram_link_codes').delete().eq('code', code);
        return jsonResponse({ ok: true });
      }
      await sb
        .from('profiles')
        .update({ telegram_chat_id: String(chatId), telegram_linked_at: new Date().toISOString() })
        .eq('id', row.user_id);
      await sb.from('telegram_link_codes').delete().eq('code', code);
      await sendMessage(chatId, 'Bağlanıldı ✓ — bildirişləri burada alacaqsan.\n/help — komandalar üçün.');
      return jsonResponse({ ok: true });
    }

    if (/^\/help\b/.test(text)) {
      await sendMessage(chatId, HELP_TEXT);
      return jsonResponse({ ok: true });
    }

    if (/^\/status\b/.test(text)) {
      const { data: prof } = await sb
        .from('profiles')
        .select('full_name, email, telegram_linked_at')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();
      if (!prof) {
        await sendMessage(chatId, 'Bu chat heç bir hesabla bağlı deyil. /start <kod> ilə bağla.');
      } else {
        const since = prof.telegram_linked_at
          ? new Date(prof.telegram_linked_at).toLocaleDateString('az-AZ')
          : '—';
        await sendMessage(chatId, `Bağlandı ✓\nHesab: ${prof.full_name ?? prof.email}\nTarix: ${since}`);
      }
      return jsonResponse({ ok: true });
    }

    if (/^\/unlink\b/.test(text)) {
      const { data: prof } = await sb
        .from('profiles')
        .select('id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();
      if (!prof) {
        await sendMessage(chatId, 'Bağlı hesab tapılmadı.');
        return jsonResponse({ ok: true });
      }
      await sb
        .from('profiles')
        .update({ telegram_chat_id: null, telegram_linked_at: null })
        .eq('id', prof.id);
      await sendMessage(chatId, 'Bağlantı silindi. Yenidən bağlamaq üçün /start <kod>.');
      return jsonResponse({ ok: true });
    }

    if (/^\//.test(text)) {
      await sendMessage(chatId, `Naməlum komanda. /help yaz.`);
    } else {
      await sendMessage(chatId, 'Bağlamaq üçün Reflect-də Telegram səhifəsindən kod al və `/start <kod>` yaz.');
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

async function sendMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export default withSentry(handler, 'telegram/webhook');
