/**
 * Knowledge base ingest — PRD §10.3 + §7.4.
 *
 * PRD pipeline: PDF → text → chunk → embed → knowledge_base row.
 * Gaps in PRD §3.1 stack: no PDF parser, no embedding provider. This endpoint
 * implements the text-only path (caller submits plain text); chunks the text
 * into paragraph-sized rows and stores them with embedding=NULL. Retrieval
 * works today via the content_tsv index (migration 0013).
 *
 * Auth: admin only (matches knowledge_base RLS in 0002).
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MAX_CHUNK_CHARS = 1500;
const MIN_CHUNK_CHARS = 80;

function chunk(text: string): string[] {
  // Split on blank lines first; if a paragraph is too long, split on sentence
  // boundaries; if still too long, hard-split at MAX_CHUNK_CHARS.
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= MAX_CHUNK_CHARS) {
      out.push(p);
      continue;
    }
    const sentences = p.split(/(?<=[.!?])\s+/);
    let buf = '';
    for (const s of sentences) {
      if ((buf + ' ' + s).length > MAX_CHUNK_CHARS) {
        if (buf) out.push(buf.trim());
        buf = s;
      } else {
        buf = buf ? `${buf} ${s}` : s;
      }
    }
    if (buf) out.push(buf.trim());
  }
  // Drop tiny fragments — they pollute search relevance.
  return out.filter((c) => c.length >= MIN_CHUNK_CHARS);
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const body = (await req.json()) as { source: string; text: string };
    const source = (body.source ?? '').trim();
    const text = (body.text ?? '').trim();
    if (!source) throw new HttpError(400, 'Missing source');
    if (!text) throw new HttpError(400, 'Missing text');
    if (text.length > 500_000) throw new HttpError(400, 'Text too large (>500k chars)');

    const chunks = chunk(text);
    if (chunks.length === 0) throw new HttpError(400, 'No chunks produced');

    const rows = chunks.map((c, i) => ({
      source_pdf: source,
      chunk_index: i,
      content: c,
      uploaded_by: user.id,
    }));

    const sb = admin();
    const { error } = await sb.from('knowledge_base').insert(rows);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, source, chunks: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
