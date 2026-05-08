/**
 * Server-side audit log helpers (PRD §9.1, §9.4).
 * Every privileged operation should append an `audit_log` row so later
 * reviews can answer "who changed what, from where".
 */
import { admin } from './auth';

export async function logAudit(input: {
  actorId: string | null;
  action: string;
  resource?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await admin().from('audit_log').insert({
      actor_id: input.actorId,
      action: input.action,
      resource: input.resource ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    });
  } catch (e) {
    // Audit failure must never block the action that triggered it.
    // eslint-disable-next-line no-console
    console.warn('[audit] insert failed', e);
  }
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}
