/**
 * Knowledge-base ingestion — PRD §7.4 / §10.3 (Bilik Bazası).
 *
 * Admin-only. v1 accepts text/markdown only — PDFs deferred per
 * product decision (logged in PR body). Pipeline:
 *   text → chunkText → OpenAI embeddings → knowledge_base rows.
 *
 * Idempotent for the same `source_pdf`: existing rows for that source are
 * deleted before re-insert so re-uploads do not duplicate. Per PRD §10.2,
 * this is "additive within a source": we are NOT renaming or dropping the
 * knowledge_base table — only refreshing rows scoped by source label.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { chunkText, embed } from '../_lib/embeddings';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const { source_pdf, content } = (await req.json()) as {
      source_pdf?: string;
      content?: string;
    };
    if (!source_pdf || !source_pdf.trim()) throw new HttpError(400, 'source_pdf required');
    if (!content || !content.trim()) throw new HttpError(400, 'content required');

    const chunks = chunkText(content);
    if (chunks.length === 0) throw new HttpError(400, 'Mətn boşdur');
    if (chunks.length > 500) throw new HttpError(413, 'Çox böyük; daha kiçik hissələrə böl');

    const embeddings = await embed(chunks);

    const sb = admin();

    // Replace any existing rows for this source label. PRD §10.2 forbids
    // dropping tables, not deleting rows; refresh-by-source is the documented
    // re-upload pattern.
    await sb.from('knowledge_base').delete().eq('source_pdf', source_pdf.trim());

    const rows = chunks.map((c, i) => ({
      source_pdf: source_pdf.trim(),
      chunk_index: i,
      content: c,
      embedding: embeddings[i],
      uploaded_by: user.id,
    }));

    const { error } = await sb.from('knowledge_base').insert(rows);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, source_pdf, chunks: chunks.length });
  } catch (e) {
    return errorResponse(e);
  }
}
