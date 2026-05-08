/**
 * Telegram bot webhook. Verifies secret_token, then handles /start <code> to bind chat_id to profile.
 * Configure: BotFather → setWebhook to https://<your-domain>/api/telegram/webhook with secret_token.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type TgMessage = {
  message?: { chat: { id: number }; text?: string };
};

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
      throw new HttpError(401, 'Bad secret');
    }
    const update = (await req.json()) as TgMessage;
    const text = update.message?.text ?? '';
    const chatId = update.message?.chat.id;
    if (!chatId) return jsonResponse({ ok: true });

    const m = text.match(/^\/start\s+([A-Z0-9]{4,12})/);
    if (!m) {
      await sendMessage(chatId, 'Bağlamaq üçün Reflect-də Telegram səhifəsindən kod al və `/start <kod>` yaz.');
      return jsonResponse({ ok: true });
    }
    const code = m[1];
    const sb = admin();
    const { data: row } = await sb
      .from('system_settings')
      .select('value')
      .eq('key', `telegram_link:${code}`)
      .maybeSingle();
    const v = row?.value as { user_id: string; expires_at: string } | undefined;
    if (!v || new Date(v.expires_at).getTime() < Date.now()) {
      await sendMessage(chatId, 'Kod yanlış və ya vaxtı keçmişdir.');
      return jsonResponse({ ok: true });
    }
    await sb
      .from('profiles')
      .update({ telegram_chat_id: String(chatId), telegram_linked_at: new Date().toISOString() })
      .eq('id', v.user_id);
    await sb.from('system_settings').delete().eq('key', `telegram_link:${code}`);
    await sendMessage(chatId, 'Bağlanıldı ✓ — bildirişləri burada alacaqsan.');
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
