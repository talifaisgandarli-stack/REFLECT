/**
 * Public survey lookup — REQ-CRM-07.
 * GET /api/surveys/lookup?token=<share_token>
 * Returns minimal info so the public form can decide whether to render the
 * questionnaire or a "thanks, already submitted" state. No PII leaked.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) throw new HttpError(400, 'token required');

    const sb = admin();
    const { data, error } = await sb
      .from('retrospective_surveys')
      .select('id, project_id, client_id, responded_at')
      .eq('share_token', token)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, 'Sorğu tapılmadı');

    return jsonResponse({ survey: data });
  } catch (e) {
    return errorResponse(e);
  }
}
