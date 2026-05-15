/**
 * Public document signed-URL endpoint (REQ-CRM-06).
 *
 * The /docs/:token public viewer needs to download files uploaded to Supabase
 * Storage (project_documents.storage_path) but cannot use a service-role key
 * client-side. This handler trades a valid share_token for a 60s signed URL,
 * gated by the token + the storage_path lookup. No auth required.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token || token.length < 10) throw new HttpError(400, 'Token tələb olunur');

    const sb = admin();
    const { data: doc, error: lookupErr } = await sb
      .from('project_documents')
      .select('storage_path')
      .eq('share_token', token)
      .maybeSingle();
    if (lookupErr) throw new HttpError(500, lookupErr.message);
    if (!doc) throw new HttpError(404, 'Sənəd tapılmadı və ya link etibarsızdır');
    if (!doc.storage_path) throw new HttpError(404, 'Bu sənədin yüklənmiş faylı yoxdur');

    const { data: signed, error: signErr } = await sb.storage
      .from('project-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (signErr || !signed?.signedUrl) throw new HttpError(500, 'Signed URL yaradıla bilmədi');

    return jsonResponse({ url: signed.signedUrl, expires_in: 60 });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'docs/signed');
