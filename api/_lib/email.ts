/**
 * Email helpers (PRD §8.4 — Resend).
 *
 * One module owns the from-address, the wordmark, and the templated HTML
 * envelopes used by transactional emails (invitation, retrospective,
 * MIRAI usage warning, share-token notification). Templates are AZ-only
 * for v1; locale-aware copy is a follow-up.
 *
 * Every helper degrades gracefully when RESEND_API_KEY is missing — the
 * surrounding action still succeeds so dev environments don't depend on
 * the email provider.
 */

const FROM = process.env.RESEND_FROM ?? 'Reflect <noreply@reflect.studio>';
const APP_URL = process.env.PUBLIC_APP_URL ?? 'https://reflect.studio';

export type EmailEnvelope = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendEmail(env: EmailEnvelope): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: env.to,
        subject: env.subject,
        text: env.text,
        html: env.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function shell(title: string, body: string): string {
  // Inline-only CSS; email clients strip <style> aggressively.
  return `<!DOCTYPE html>
<html lang="az"><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1F2925;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E8E6DD;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#0E1611;padding:20px 24px;color:#DCFCE7;font-size:18px;font-weight:700;">
          Reflect
        </td></tr>
        <tr><td style="padding:28px 28px 16px 28px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1A5140;">${escape(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:0 28px 28px 28px;">
          <p style="font-size:12px;color:#7A857F;margin:24px 0 0 0;">
            Bu məktub Reflect tərəfindən avtomatik göndərilib. Suallar üçün studiyaya yazın.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function btn(label: string, href: string): string {
  return `<p style="margin:24px 0;"><a href="${escape(href)}"
    style="display:inline-block;background:#ADFB49;color:#0E1611;text-decoration:none;
    padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">${escape(label)}</a></p>`;
}

// ---------------- Templates ----------------

export type EmailLocale = 'az' | 'en' | 'ru';

type InviteCopy = {
  subject: string;
  hello: string;
  intro: (inviter: string, role: string) => string;
  cta: string;
  footer: string;
  textTitle: (inviter: string, role: string) => string;
  textTtl: string;
  defaultInviter: string;
};
const INVITE: Record<EmailLocale, InviteCopy> = {
  az: {
    subject: 'Reflect-ə dəvətnamə',
    hello: 'Salam,',
    intro: (i, r) =>
      `${escape(i)} sizi Reflect arxitektura studiyası platformasına <strong>${escape(r)}</strong> rolu ilə dəvət edir.`,
    cta: 'Dəvəti qəbul et',
    footer:
      'Linkin müddəti 48 saatdır. Açılmırsa, bu ünvanı brauzerə yapışdır:',
    textTitle: (i, r) => `${i} sizi Reflect-ə ${r} rolu ilə dəvət edir.`,
    textTtl: 'Müddət: 48 saat.',
    defaultInviter: 'Reflect studiyası',
  },
  en: {
    subject: 'Reflect — invitation',
    hello: 'Hi,',
    intro: (i, r) =>
      `${escape(i)} invites you to join the Reflect studio platform as <strong>${escape(r)}</strong>.`,
    cta: 'Accept invitation',
    footer: 'The link expires in 48 hours. If the button is dead, paste this URL:',
    textTitle: (i, r) => `${i} invites you to Reflect as ${r}.`,
    textTtl: 'Expires in 48 hours.',
    defaultInviter: 'Reflect studio',
  },
  ru: {
    subject: 'Reflect — приглашение',
    hello: 'Здравствуйте,',
    intro: (i, r) =>
      `${escape(i)} приглашает вас в платформу Reflect как <strong>${escape(r)}</strong>.`,
    cta: 'Принять приглашение',
    footer:
      'Ссылка действительна 48 часов. Если кнопка не работает, вставьте адрес в браузер:',
    textTitle: (i, r) => `${i} приглашает вас в Reflect (роль: ${r}).`,
    textTtl: 'Срок: 48 часов.',
    defaultInviter: 'Reflect',
  },
};

export function inviteEmail(opts: {
  to: string;
  inviteToken: string;
  inviterName: string | null;
  roleName: string;
  locale?: EmailLocale;
}): EmailEnvelope {
  const c = INVITE[opts.locale ?? 'az'];
  const link = `${APP_URL}/login?invite=${opts.inviteToken}`;
  const inviter = opts.inviterName ?? c.defaultInviter;
  const html = shell(
    c.subject,
    `<p style="margin:0 0 12px 0;">${c.hello}</p>
     <p style="margin:0 0 12px 0;">${c.intro(inviter, opts.roleName)}</p>
     ${btn(c.cta, link)}
     <p style="margin:0;font-size:13px;color:#4F5A55;">${c.footer}<br>
       <code style="font-size:12px;color:#1A5140;">${escape(link)}</code>
     </p>`,
  );
  const text = [c.hello, c.textTitle(inviter, opts.roleName), '', `→ ${link}`, c.textTtl].join(
    '\n',
  );
  return { to: opts.to, subject: c.subject, html, text };
}

const SHARE: Record<EmailLocale, { subject: string; intro: (s: string, t: string) => string; cta: string; secret: string; defaultSender: string }> = {
  az: {
    subject: 'Reflect — sənəd',
    intro: (s, t) =>
      `${escape(s)} sizinlə bir sənəd paylaşdı: <strong>${escape(t)}</strong>.`,
    cta: 'Sənədi aç',
    secret: 'Link gizlidir — yalnız sizinlə paylaşılıb.',
    defaultSender: 'Reflect',
  },
  en: {
    subject: 'Reflect — shared document',
    intro: (s, t) => `${escape(s)} shared a document with you: <strong>${escape(t)}</strong>.`,
    cta: 'Open document',
    secret: 'This link is private — shared only with you.',
    defaultSender: 'Reflect',
  },
  ru: {
    subject: 'Reflect — документ',
    intro: (s, t) =>
      `${escape(s)} поделился(ась) с вами документом: <strong>${escape(t)}</strong>.`,
    cta: 'Открыть документ',
    secret: 'Ссылка приватная — отправлена только вам.',
    defaultSender: 'Reflect',
  },
};

export function shareTokenEmail(opts: {
  to: string;
  documentTitle: string;
  shareUrl: string;
  fromName: string | null;
  locale?: EmailLocale;
}): EmailEnvelope {
  const c = SHARE[opts.locale ?? 'az'];
  const sender = opts.fromName ?? c.defaultSender;
  const html = shell(
    c.subject,
    `<p style="margin:0 0 12px 0;">${c.intro(sender, opts.documentTitle)}</p>
     ${btn(c.cta, opts.shareUrl)}
     <p style="margin:0;font-size:13px;color:#4F5A55;">${c.secret}</p>`,
  );
  const text = `${sender} → ${opts.documentTitle}\n\n${opts.shareUrl}`;
  return { to: opts.to, subject: `${c.subject} — ${opts.documentTitle}`, html, text };
}

const BUDGET: Record<EmailLocale, { subject: (p: number) => string; body: (p: number, s: number, c: number) => string }> = {
  az: {
    subject: (p) => `Reflect — MIRAI büdcəsi ${p}%`,
    body: (p, s, c) =>
      `Sənin aylıq MIRAI istifadən <strong>${p}%</strong>-ə çatıb (${s.toFixed(2)}$ / ${c}$).`,
  },
  en: {
    subject: (p) => `Reflect — MIRAI budget ${p}%`,
    body: (p, s, c) =>
      `Your monthly MIRAI usage is at <strong>${p}%</strong> (${s.toFixed(2)}$ / ${c}$).`,
  },
  ru: {
    subject: (p) => `Reflect — бюджет MIRAI ${p}%`,
    body: (p, s, c) =>
      `Ваш месячный лимит MIRAI: <strong>${p}%</strong> (${s.toFixed(2)}$ / ${c}$).`,
  },
};

export function miraiBudgetEmail(opts: {
  to: string;
  pct: number;
  spent: number;
  cap: number;
  locale?: EmailLocale;
}): EmailEnvelope {
  const pct = Math.round(opts.pct * 100);
  const c = BUDGET[opts.locale ?? 'az'];
  const html = shell(
    c.subject(pct),
    `<p style="margin:0 0 12px 0;">${c.body(pct, opts.spent, opts.cap)}</p>`,
  );
  const text = c.subject(pct);
  return { to: opts.to, subject: c.subject(pct), html, text };
}
