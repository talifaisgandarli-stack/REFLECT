/**
 * Telegram bot webhook (PRD §8.1).
 *
 * Commands:
 *   /start <code>   — bind chat_id to a Reflect profile (one-time link code)
 *   /tasks          — list user's open tasks (max 5)
 *   /today          — tasks due today or overdue
 *   /balance        — admin only: current cash balance + receivables
 *   /help           — list available commands
 *
 * Inbound finance command runs through the same admin gate as PRD §8.1
 * outbound finance notifications: only chat IDs bound to admin profiles
 * see `/balance` results.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type TgMessage = {
  message?: { chat: { id: number }; text?: string };
};

const TZ = 'Asia/Baku';

function bakuToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
      throw new HttpError(401, 'Bad secret');
    }
    const update = (await req.json()) as TgMessage;
    const text = (update.message?.text ?? '').trim();
    const chatId = update.message?.chat.id;
    if (!chatId) return jsonResponse({ ok: true });

    // /start linking flow (existing, kept verbatim)
    const start = text.match(/^\/start\s+([A-Z0-9]{4,12})/);
    if (start) {
      await handleStart(chatId, start[1]);
      return jsonResponse({ ok: true });
    }

    if (text === '/help' || text === '/start') {
      await sendMessage(
        chatId,
        [
          'Reflect bot komandaları:',
          '/start <kod> — hesabı bağla',
          '/tasks — açıq tapşırıqların siyahısı',
          '/today — bu gün üçün son tarixli tapşırıqlar',
          '/balance — cari balans (admin)',
        ].join('\n'),
      );
      return jsonResponse({ ok: true });
    }

    if (text === '/tasks') {
      await handleTasks(chatId, 'open');
      return jsonResponse({ ok: true });
    }

    if (text === '/today') {
      await handleTasks(chatId, 'today');
      return jsonResponse({ ok: true });
    }

    if (text === '/balance') {
      await handleBalance(chatId);
      return jsonResponse({ ok: true });
    }

    await sendMessage(
      chatId,
      'Bilmədiyim komanda. /help yaz — siyahını göndərim.',
    );
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

async function handleStart(chatId: number, code: string) {
  const sb = admin();
  const { data: row } = await sb
    .from('system_settings')
    .select('value')
    .eq('key', `telegram_link:${code}`)
    .maybeSingle();
  const v = row?.value as { user_id: string; expires_at: string } | undefined;
  if (!v || new Date(v.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, 'Kod yanlış və ya vaxtı keçmişdir.');
    return;
  }
  await sb
    .from('profiles')
    .update({ telegram_chat_id: String(chatId), telegram_linked_at: new Date().toISOString() })
    .eq('id', v.user_id);
  await sb.from('system_settings').delete().eq('key', `telegram_link:${code}`);
  await sendMessage(chatId, 'Bağlanıldı ✓ — bildirişləri burada alacaqsan.');
}

async function resolveProfile(chatId: number) {
  const sb = admin();
  const { data: profile } = await sb
    .from('profiles')
    .select('id, full_name, email, is_creator, role_id')
    .eq('telegram_chat_id', String(chatId))
    .maybeSingle();
  if (!profile) return null;
  let isAdmin = !!profile.is_creator;
  if (!isAdmin && profile.role_id) {
    const { data: role } = await sb
      .from('roles')
      .select('is_admin')
      .eq('id', profile.role_id)
      .maybeSingle();
    isAdmin = !!role?.is_admin;
  }
  return { ...profile, isAdmin };
}

async function handleTasks(chatId: number, mode: 'open' | 'today') {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, 'Hesab bağlı deyil. /start <kod> ilə bağlamaq lazımdır.');
    return;
  }
  const sb = admin();
  let q = sb
    .from('tasks')
    .select('id, title, status, deadline, project_id')
    .contains('assignee_ids', [profile.id])
    .is('archived_at', null)
    .not('status', 'in', '(done,cancelled)')
    .order('deadline', { ascending: true })
    .limit(10);
  if (mode === 'today') {
    q = q.lte('deadline', bakuToday());
  }
  const { data, error } = await q;
  if (error) {
    await sendMessage(chatId, 'Tapşırıqları gətirə bilmədim.');
    return;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    await sendMessage(
      chatId,
      mode === 'today' ? 'Bu gün üçün açıq tapşırığın yoxdur ✓' : 'Açıq tapşırığın yoxdur ✓',
    );
    return;
  }
  const header = mode === 'today' ? 'Bu gün:' : `Açıq tapşırıqlar (${rows.length}):`;
  const lines = rows.slice(0, 5).map((t) => {
    const deadline = t.deadline ? ` · ${t.deadline}` : '';
    return `• ${t.title}${deadline}`;
  });
  if (rows.length > 5) lines.push(`(daha ${rows.length - 5} ədəd)`);
  await sendMessage(chatId, [header, ...lines].join('\n'));
}

async function handleBalance(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, 'Hesab bağlı deyil.');
    return;
  }
  if (!profile.isAdmin) {
    // PRD §8.1 — finance routes admin-only
    await sendMessage(chatId, 'Bu komanda yalnız adminlər üçündür.');
    return;
  }
  const sb = admin();
  const [income, expense, debtor] = await Promise.all([
    sb.from('incomes').select('amount'),
    sb.from('expenses').select('amount'),
    sb.from('receivables').select('amount, paid_amount'),
  ]);
  const tIn = (income.data ?? []).reduce(
    (s: number, r: { amount: number | string }) => s + Number(r.amount),
    0,
  );
  const tOut = (expense.data ?? []).reduce(
    (s: number, r: { amount: number | string }) => s + Number(r.amount),
    0,
  );
  const debt = (debtor.data ?? []).reduce(
    (s: number, r: { amount: number | string; paid_amount: number | string }) =>
      s + Math.max(0, Number(r.amount) - Number(r.paid_amount)),
    0,
  );
  const fmt = new Intl.NumberFormat('az-AZ', {
    style: 'currency',
    currency: 'AZN',
    maximumFractionDigits: 0,
  });
  await sendMessage(
    chatId,
    [
      'Reflect — cari balans',
      `Gəlir: ${fmt.format(tIn)}`,
      `Xərc: ${fmt.format(tOut)}`,
      `Balans: ${fmt.format(tIn - tOut)}`,
      `Debitor: ${fmt.format(debt)}`,
    ].join('\n'),
  );
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
