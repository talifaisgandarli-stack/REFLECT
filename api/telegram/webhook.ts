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
          '/projects — aktiv layihələrin xülasəsi',
          '/mentions — sənə son müraciətlər',
          '/leave — sənin son məzuniyyət müraciətlərin',
          '/equipment — sənə təyin olunmuş avadanlıq',
          '/comments — sənin son şərhlərin',
          '/balance — cari balans (admin)',
          '/forecast — 30/60/90 gün cash forecast (admin)',
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

    if (text === '/projects') {
      await handleProjects(chatId);
      return jsonResponse({ ok: true });
    }

    if (text === '/forecast') {
      await handleForecast(chatId);
      return jsonResponse({ ok: true });
    }

    if (text === '/mentions') {
      await handleMentions(chatId);
      return jsonResponse({ ok: true });
    }

    if (text === '/leave') {
      await handleLeave(chatId);
      return jsonResponse({ ok: true });
    }

    if (text === '/equipment') {
      await handleEquipment(chatId);
      return jsonResponse({ ok: true });
    }

    if (text === '/comments') {
      await handleComments(chatId);
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
    .select('id, full_name, email, is_creator, role_id, locale')
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
  const locale: 'az' | 'en' | 'ru' =
    profile.locale === 'en' || profile.locale === 'ru' ? profile.locale : 'az';
  return { ...profile, isAdmin, locale };
}

type TgLocale = 'az' | 'en' | 'ru';
const TG_TEXT: Record<TgLocale, Record<string, string>> = {
  az: {
    not_linked: 'Hesab bağlı deyil. /start <kod> ilə bağlamaq lazımdır.',
    admin_only: 'Bu komanda yalnız adminlər üçündür.',
    no_open_tasks: 'Açıq tapşırığın yoxdur ✓',
    no_today: 'Bu gün üçün açıq tapşırığın yoxdur ✓',
    today: 'Bu gün:',
    open_tasks: 'Açıq tapşırıqlar',
    more: 'daha',
    no_active_projects: 'Aktiv layihə yoxdur.',
    active_projects: 'Aktiv layihələr',
    forecast_missing: 'Hələ forecast yoxdur (cron işə düşməyib).',
    forecast_title: 'Cash forecast',
    no_mentions: 'Müraciət yoxdur ✓',
    mentions_title: 'Son müraciətlər',
    no_leaves: 'Məzuniyyət müraciətin yoxdur.',
    leaves_title: 'Son məzuniyyətlər:',
    no_equipment: 'Sənə təyin olunmuş avadanlıq yoxdur.',
    equipment_title: 'Avadanlıqların',
    no_comments: 'Hələ heç bir şərh yazmamısan.',
    comments_title: 'Son şərhlər:',
    balance_title: 'Reflect — cari balans',
    bal_in: 'Gəlir',
    bal_out: 'Xərc',
    bal_balance: 'Balans',
    bal_debt: 'Debitor',
    unknown_command: 'Bilmədiyim komanda. /help yaz — siyahını göndərim.',
  },
  en: {
    not_linked: 'Account not linked. Use /start <code> to bind.',
    admin_only: 'This command is admin-only.',
    no_open_tasks: 'No open tasks ✓',
    no_today: 'Nothing due today ✓',
    today: 'Today:',
    open_tasks: 'Open tasks',
    more: 'more',
    no_active_projects: 'No active projects.',
    active_projects: 'Active projects',
    forecast_missing: 'No forecast yet (cron has not run).',
    forecast_title: 'Cash forecast',
    no_mentions: 'No mentions ✓',
    mentions_title: 'Recent mentions',
    no_leaves: 'No leave requests.',
    leaves_title: 'Recent leave:',
    no_equipment: 'No equipment assigned to you.',
    equipment_title: 'Your equipment',
    no_comments: 'No comments yet.',
    comments_title: 'Recent comments:',
    balance_title: 'Reflect — current balance',
    bal_in: 'Income',
    bal_out: 'Expense',
    bal_balance: 'Balance',
    bal_debt: 'Receivables',
    unknown_command: 'Unknown command. Send /help for the list.',
  },
  ru: {
    not_linked: 'Аккаунт не привязан. /start <код> для привязки.',
    admin_only: 'Эта команда только для админов.',
    no_open_tasks: 'Открытых задач нет ✓',
    no_today: 'На сегодня задач нет ✓',
    today: 'Сегодня:',
    open_tasks: 'Открытые задачи',
    more: 'ещё',
    no_active_projects: 'Активных проектов нет.',
    active_projects: 'Активные проекты',
    forecast_missing: 'Прогноза пока нет (крон не сработал).',
    forecast_title: 'Кэш-прогноз',
    no_mentions: 'Упоминаний нет ✓',
    mentions_title: 'Последние упоминания',
    no_leaves: 'Заявок на отпуск нет.',
    leaves_title: 'Последние отпуска:',
    no_equipment: 'Оборудование за вами не закреплено.',
    equipment_title: 'Ваше оборудование',
    no_comments: 'Комментариев пока нет.',
    comments_title: 'Последние комментарии:',
    balance_title: 'Reflect — текущий баланс',
    bal_in: 'Доход',
    bal_out: 'Расход',
    bal_balance: 'Баланс',
    bal_debt: 'Дебиторы',
    unknown_command: 'Неизвестная команда. /help — список.',
  },
};
function tg(locale: TgLocale, key: string): string {
  return TG_TEXT[locale][key] ?? TG_TEXT.az[key] ?? key;
}

async function handleTasks(chatId: number, mode: 'open' | 'today') {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
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
    await sendMessage(chatId, tg(L, mode === 'today' ? 'no_today' : 'no_open_tasks'));
    return;
  }
  const header =
    mode === 'today' ? tg(L, 'today') : `${tg(L, 'open_tasks')} (${rows.length}):`;
  const lines = rows.slice(0, 5).map((t) => {
    const deadline = t.deadline ? ` · ${t.deadline}` : '';
    return `• ${t.title}${deadline}`;
  });
  if (rows.length > 5) lines.push(`(${rows.length - 5} ${tg(L, 'more')})`);
  await sendMessage(chatId, [header, ...lines].join('\n'));
}

async function handleBalance(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  if (!profile.isAdmin) {
    // PRD §8.1 — finance routes admin-only
    await sendMessage(chatId, tg(L, 'admin_only'));
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
      tg(L, 'balance_title'),
      `${tg(L, 'bal_in')}: ${fmt.format(tIn)}`,
      `${tg(L, 'bal_out')}: ${fmt.format(tOut)}`,
      `${tg(L, 'bal_balance')}: ${fmt.format(tIn - tOut)}`,
      `${tg(L, 'bal_debt')}: ${fmt.format(debt)}`,
    ].join('\n'),
  );
}

async function handleProjects(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  const sb = admin();
  const { data } = await sb
    .from('projects')
    .select('id, name, status, deadline, phases')
    .eq('status', 'active')
    .is('archived_at', null)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(8);
  const rows = (data ?? []) as Array<{
    name: string;
    deadline: string | null;
    phases: string[];
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, tg(L, 'no_active_projects'));
    return;
  }
  const lines = rows.map((p) => {
    const phase = p.phases?.length ? p.phases[p.phases.length - 1] : '—';
    const dl = p.deadline ? ` · ${p.deadline}` : '';
    return `• ${p.name} (${phase})${dl}`;
  });
  await sendMessage(
    chatId,
    [`${tg(L, 'active_projects')} (${rows.length}):`, ...lines].join('\n'),
  );
}

async function handleForecast(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  if (!profile.isAdmin) {
    await sendMessage(chatId, tg(L, 'admin_only'));
    return;
  }
  const sb = admin();
  const { data } = await sb
    .from('cash_forecasts')
    .select('horizon_days, projected_balance, confidence_low, confidence_high')
    .order('generated_at', { ascending: false })
    .limit(3);
  const rows = (data ?? []) as Array<{
    horizon_days: number;
    projected_balance: number;
    confidence_low: number;
    confidence_high: number;
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, tg(L, 'forecast_missing'));
    return;
  }
  const fmt = new Intl.NumberFormat('az-AZ', {
    style: 'currency',
    currency: 'AZN',
    maximumFractionDigits: 0,
  });
  const lines = rows
    .sort((a, b) => a.horizon_days - b.horizon_days)
    .map(
      (r) =>
        `${r.horizon_days} gün: ${fmt.format(Number(r.projected_balance))} (${fmt.format(
          Number(r.confidence_low),
        )} – ${fmt.format(Number(r.confidence_high))})`,
    );
  await sendMessage(chatId, [tg(L, 'forecast_title'), ...lines].join('\n'));
}

async function handleMentions(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  const sb = admin();
  const { data } = await sb
    .from('notifications')
    .select('payload, created_at')
    .eq('user_id', profile.id)
    .eq('kind', 'mention')
    .order('created_at', { ascending: false })
    .limit(5);
  const rows = (data ?? []) as Array<{
    payload: { task_id?: string };
    created_at: string;
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, tg(L, 'no_mentions'));
    return;
  }
  const lines = rows.map((r) => {
    const tid = r.payload?.task_id;
    return `• ${r.created_at.slice(0, 10)} · #${tid ? tid.slice(0, 8) : '—'}`;
  });
  await sendMessage(chatId, [`${tg(L, 'mentions_title')} (${rows.length}):`, ...lines].join('\n'));
}

async function handleLeave(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  const sb = admin();
  const { data } = await sb
    .from('leave_requests')
    .select('kind, starts_at, ends_at, days, status')
    .eq('employee_id', profile.id)
    .order('starts_at', { ascending: false })
    .limit(5);
  const rows = (data ?? []) as Array<{
    kind: string;
    starts_at: string;
    ends_at: string;
    days: number;
    status: string;
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, tg(L, 'no_leaves'));
    return;
  }
  const lines = rows.map(
    (r) => `• ${r.starts_at} → ${r.ends_at} · ${r.days} · ${r.kind} · ${r.status}`,
  );
  await sendMessage(chatId, [tg(L, 'leaves_title'), ...lines].join('\n'));
}

async function handleEquipment(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  const sb = admin();
  const { data } = await sb
    .from('equipment')
    .select('name, kind, serial, condition')
    .eq('assigned_to', profile.id)
    .order('name');
  const rows = (data ?? []) as Array<{
    name: string;
    kind: string | null;
    serial: string | null;
    condition: string | null;
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, tg(L, 'no_equipment'));
    return;
  }
  const lines = rows.map((r) => {
    const tail = [r.kind, r.serial, r.condition].filter(Boolean).join(' · ');
    return `• ${r.name}${tail ? ' — ' + tail : ''}`;
  });
  await sendMessage(chatId, [`${tg(L, 'equipment_title')} (${rows.length}):`, ...lines].join('\n'));
}

async function handleComments(chatId: number) {
  const profile = await resolveProfile(chatId);
  if (!profile) {
    await sendMessage(chatId, tg('az', 'not_linked'));
    return;
  }
  const L = profile.locale;
  const sb = admin();
  const { data } = await sb
    .from('task_comments')
    .select('task_id, body, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(5);
  const rows = (data ?? []) as Array<{
    task_id: string;
    body: string;
    created_at: string;
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, tg(L, 'no_comments'));
    return;
  }
  const lines = rows.map((r) => {
    const trimmed = r.body.replace(/\s+/g, ' ').slice(0, 80);
    return `• ${r.created_at.slice(0, 10)} · ${trimmed}${r.body.length > 80 ? '…' : ''}`;
  });
  await sendMessage(chatId, [`${tg(L, 'comments_title')} (${rows.length}):`, ...lines].join('\n'));
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
