/**
 * Public survey submit — REQ-CRM-07.
 * POST /api/surveys/respond  { token, nps_score, ratings, comment? }
 * Admin client; RLS-safe. Idempotent: rejects if already responded.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type Body = {
  token?: string;
  nps_score?: number;
  ratings?: Record<string, number>;
  comment?: string | null;
};

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const { token, nps_score, ratings, comment } = (await req.json()) as Body;
    if (!token) throw new HttpError(400, 'token required');
    if (nps_score == null || nps_score < 0 || nps_score > 10) {
      throw new HttpError(400, 'NPS 0–10 aralığında olmalıdır');
    }
    if (ratings) {
      for (const v of Object.values(ratings)) {
        if (v < 1 || v > 5) throw new HttpError(400, 'Reytinqlər 1–5 aralığında olmalıdır');
      }
    }

    const sb = admin();
    const { data: existing } = await sb
      .from('retrospective_surveys')
      .select('id, responded_at')
      .eq('share_token', token)
      .maybeSingle();
    if (!existing) throw new HttpError(404, 'Sorğu tapılmadı');
    if (existing.responded_at) throw new HttpError(409, 'Bu sorğu artıq cavablanıb');

    const { error } = await sb
      .from('retrospective_surveys')
      .update({
        nps_score,
        ratings: ratings ?? {},
        comment: comment ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
