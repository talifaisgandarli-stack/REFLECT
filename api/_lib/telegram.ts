/**
 * Telegram Bot API helpers — PRD §8.1.
 *
 * Single Reflect bot. Token in TELEGRAM_BOT_TOKEN. We talk to the Bot API
 * directly via fetch (no client library; PRD-guard rule 4).
 */

const API = 'https://api.telegram.org';

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  opts?: { parse_mode?: 'Markdown' | 'HTML' },
): Promise<{ ok: boolean; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: opts?.parse_mode,
      disable_web_page_preview: true,
    }),
  });
  return (await res.json().catch(() => ({ ok: false }))) as {
    ok: boolean;
    description?: string;
  };
}

/** Bot deep-link from BotFather setup. Used in the linking flow. */
export function botDeepLink(code: string): string {
  const username = process.env.TELEGRAM_BOT_USERNAME ?? '';
  if (!username) return '';
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}
