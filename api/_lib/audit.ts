/**
 * Server-side audit log helper — PRD §9.4.
 * Writes privileged actions to audit_log (RLS: admin SELECT only).
 * Fire-and-forget: never throws, so an audit failure never breaks the request.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction =
  | 'role_change'
  | 'settings.update'
  | 'invitation.created'
  | 'invitation.accepted';

export async function logAudit(
  sb: SupabaseClient,
  opts: {
    actorId: string;
    action: AuditAction;
    resource: string;
    ip?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await sb.from('audit_log').insert({
      actor_id: opts.actorId,
      action: opts.action,
      resource: opts.resource,
      ip: opts.ip ?? null,
      user_agent: opts.userAgent ?? null,
      ...(opts.meta ? { meta: opts.meta } : {}),
    });
  } catch {
    // Intentionally silent — audit failure must never break the request.
  }
}
