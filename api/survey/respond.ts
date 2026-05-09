/**
 * Public retrospective survey endpoint — REQ-CRM-07.
 *
 * Anonymous: only the share_token authenticates the submitter.
 * GET  /api/survey/respond?token=…  → returns project name + already-responded flag
 * POST /api/survey/respond           → body { token, nps_score, ratings, comment }
 *
 * No Supabase auth required (public form per PRD line 396). Uses the admin
 * client to bypass RLS but limits writes to the row matched by share_token.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

type Survey = {
  id: string;
  project_id: string | null;
  client_id: string | null;
  share_token: string;
  responded_at: string | null;
};

async function fetchByToken(sb: ReturnType<typeof admin>, token: string): Promise<Survey | null> {
  const { data } = await sb
    .from('retrospective_surveys')
    .select('id, project_id, client_id, share_token, responded_at')
    .eq('share_token', token)
    .maybeSingle<Survey>();
  return data ?? null;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const sb = admin();

    if (req.method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      if (!token) throw new HttpError(400, 'Missing token');
      const survey = await fetchByToken(sb, token);
      if (!survey) throw new HttpError(404, 'Survey not found');
      let projectName: string | null = null;
      if (survey.project_id) {
        const { data: proj } = await sb
          .from('projects')
          .select('name')
          .eq('id', survey.project_id)
          .maybeSingle<{ name: string }>();
        projectName = proj?.name ?? null;
      }
      return jsonResponse({
        ok: true,
        responded: !!survey.responded_at,
        project_name: projectName,
      });
    }

    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    const body = (await req.json()) as {
      token?: string;
      nps_score?: number;
      ratings?: Record<string, number>;
      comment?: string;
    };
    const token = body.token ?? '';
    if (!token) throw new HttpError(400, 'Missing token');
    if (body.nps_score == null || body.nps_score < 0 || body.nps_score > 10) {
      throw new HttpError(400, 'nps_score must be 0–10');
    }

    const survey = await fetchByToken(sb, token);
    if (!survey) throw new HttpError(404, 'Survey not found');
    if (survey.responded_at) {
      // Idempotent: don't error, just confirm already received.
      return jsonResponse({ ok: true, already_responded: true });
    }

    const { error } = await sb
      .from('retrospective_surveys')
      .update({
        nps_score: body.nps_score,
        ratings: body.ratings ?? {},
        comment: body.comment ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq('share_token', token);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
