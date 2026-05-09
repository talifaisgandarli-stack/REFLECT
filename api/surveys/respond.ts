/**
 * REQ-CRM-07: Public survey response endpoint — no auth required.
 * Validates share_token, records NPS 0-10, per-category ratings 1-5, and free comment.
 */
import { admin, errorResponse, HttpError, jsonResponse, rateLimit } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
    await rateLimit(null, ip);
    const body = await req.json().catch(() => null);
    const token = body?.share_token as string | undefined;
    const nps = body?.nps_score;
    const ratings = body?.ratings;
    const comment = body?.comment;

    if (!token || typeof token !== 'string') throw new HttpError(400, 'share_token tələb olunur');
    if (typeof nps !== 'number' || nps < 0 || nps > 10 || !Number.isInteger(nps)) {
      throw new HttpError(400, 'nps_score 0–10 tam ədəd olmalıdır');
    }
    if (ratings !== undefined && (typeof ratings !== 'object' || Array.isArray(ratings) || ratings === null)) {
      throw new HttpError(400, 'ratings JSON obyekt olmalıdır');
    }
    if (ratings) {
      for (const [, v] of Object.entries(ratings)) {
        if (typeof v !== 'number' || v < 1 || v > 5 || !Number.isInteger(v)) {
          throw new HttpError(400, 'Hər reytinq 1–5 tam ədəd olmalıdır');
        }
      }
    }

    const sb = admin();

    const { data: survey } = await sb
      .from('retrospective_surveys')
      .select('id, responded_at')
      .eq('share_token', token)
      .maybeSingle();

    if (!survey) throw new HttpError(404, 'Sorğu tapılmadı');
    if (survey.responded_at) throw new HttpError(409, 'Bu sorğu artıq cavablanıb');

    await sb.from('retrospective_surveys').update({
      nps_score: nps,
      ratings: ratings ?? null,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 2000) : null,
      responded_at: new Date().toISOString(),
    }).eq('id', survey.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
