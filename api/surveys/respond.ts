/**
 * REQ-CRM-07: Public survey response endpoint — no auth required.
 * PRD §9.1: Zod schema at API boundary.
 */
import { z } from 'zod';
import { admin, errorResponse, HttpError, jsonResponse, rateLimit } from '../_lib/auth';

export const config = { runtime: 'edge' };

const RespondSchema = z.object({
  share_token: z.string().min(1, 'share_token tələb olunur'),
  nps_score: z.number().int().min(0, 'nps_score 0–10 tam ədəd olmalıdır').max(10, 'nps_score 0–10 tam ədəd olmalıdır'),
  ratings: z
    .record(z.string(), z.number().int().min(1).max(5, 'Hər reytinq 1–5 tam ədəd olmalıdır'))
    .optional(),
  comment: z.string().max(2000).optional(),
});

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';
    await rateLimit(null, ip);

    const raw = await req.json().catch(() => null);
    const parsed = RespondSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((e) => e.message).join('; '));
    }
    const { share_token: token, nps_score: nps, ratings, comment } = parsed.data;

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
      comment: comment?.trim() ?? null,
      responded_at: new Date().toISOString(),
    }).eq('id', survey.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
