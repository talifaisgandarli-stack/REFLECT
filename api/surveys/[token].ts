/**
 * REQ-CRM-07 — Retrospective survey public endpoint.
 * GET  /api/surveys/[token] → returns minimal project metadata
 * POST /api/surveys/[token] → records nps_score, ratings (jsonb), comment
 * Auth model: share_token only (public read+write while not yet responded).
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.pathname.split('/').pop();
    if (!token) throw new HttpError(400, 'Missing token');

    const sb = admin();

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('retrospective_surveys')
        .select('id, project_id, responded_at, projects(name)')
        .eq('share_token', token)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) throw new HttpError(404, 'Survey not found');
      return jsonResponse({
        id: data.id,
        project_name: (data.projects as { name?: string } | null)?.name ?? null,
        responded: !!data.responded_at,
      });
    }

    if (req.method === 'POST') {
      const body = (await req.json()) as {
        nps_score?: number;
        ratings?: Record<string, number>;
        comment?: string;
      };
      const nps = Number(body.nps_score);
      if (!Number.isFinite(nps) || nps < 0 || nps > 10) {
        throw new HttpError(400, 'NPS score must be 0..10');
      }
      const { data: existing } = await sb
        .from('retrospective_surveys')
        .select('id, responded_at')
        .eq('share_token', token)
        .maybeSingle();
      if (!existing) throw new HttpError(404, 'Survey not found');
      if (existing.responded_at) throw new HttpError(409, 'Already submitted');

      const { error } = await sb
        .from('retrospective_surveys')
        .update({
          nps_score: Math.round(nps),
          ratings: body.ratings ?? {},
          comment: body.comment ?? null,
          responded_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ ok: true });
    }

    throw new HttpError(405, 'Method not allowed');
  } catch (e) {
    return errorResponse(e);
  }
}
