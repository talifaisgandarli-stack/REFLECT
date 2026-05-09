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

export function inviteEmail(opts: {
  to: string;
  inviteToken: string;
  inviterName: string | null;
  roleName: string;
}): EmailEnvelope {
  const link = `${APP_URL}/login?invite=${opts.inviteToken}`;
  const inviter = opts.inviterName ?? 'Reflect studiyası';
  const html = shell(
    'Reflect-ə dəvətnamə',
    `<p style="margin:0 0 12px 0;">Salam,</p>
     <p style="margin:0 0 12px 0;">${escape(inviter)} sizi Reflect arxitektura
       studiyası platformasına <strong>${escape(opts.roleName)}</strong> rolu ilə dəvət edir.</p>
     ${btn('Dəvəti qəbul et', link)}
     <p style="margin:0;font-size:13px;color:#4F5A55;">Linkin müddəti 48 saatdır. Açılmırsa, bu ünvanı brauzerə yapışdır:<br>
       <code style="font-size:12px;color:#1A5140;">${escape(link)}</code>
     </p>`,
  );
  const text = [
    `Salam,`,
    `${inviter} sizi Reflect-ə ${opts.roleName} rolu ilə dəvət edir.`,
    ``,
    `Dəvəti qəbul et: ${link}`,
    `Müddət: 48 saat.`,
  ].join('\n');
  return { to: opts.to, subject: 'Reflect-ə dəvətnamə', html, text };
}

export function shareTokenEmail(opts: {
  to: string;
  documentTitle: string;
  shareUrl: string;
  fromName: string | null;
}): EmailEnvelope {
  const sender = opts.fromName ?? 'Reflect';
  const html = shell(
    'Sənəd sizinlə paylaşıldı',
    `<p style="margin:0 0 12px 0;">Salam,</p>
     <p style="margin:0 0 12px 0;">${escape(sender)} sizinlə bir sənəd paylaşdı:
       <strong>${escape(opts.documentTitle)}</strong>.</p>
     ${btn('Sənədi aç', opts.shareUrl)}
     <p style="margin:0;font-size:13px;color:#4F5A55;">Link gizlidir — yalnız sizinlə paylaşılıb.</p>`,
  );
  const text = `${sender} sizinlə paylaşdı: ${opts.documentTitle}\n\n${opts.shareUrl}`;
  return { to: opts.to, subject: `Reflect — ${opts.documentTitle}`, html, text };
}

export function miraiBudgetEmail(opts: {
  to: string;
  pct: number;
  spent: number;
  cap: number;
}): EmailEnvelope {
  const pct = Math.round(opts.pct * 100);
  const html = shell(
    `MIRAI büdcəsi ${pct}%`,
    `<p style="margin:0 0 12px 0;">Sənin aylıq MIRAI istifadən
       <strong>${pct}%</strong>-ə çatıb (${opts.spent.toFixed(2)}$ / ${opts.cap}$).</p>
     <p style="margin:0 0 12px 0;">Limit dolanda chat dayanır və növbəti
       ay yenilənir. Sual budgetə uyğun qalsın deyə qısa şəkildə soruşmağa dəyər.</p>`,
  );
  const text = `MIRAI büdcəsi ${pct}% (${opts.spent.toFixed(2)}$ / ${opts.cap}$).`;
  return { to: opts.to, subject: 'Reflect — MIRAI büdcə xəbərdarlığı', html, text };
}
