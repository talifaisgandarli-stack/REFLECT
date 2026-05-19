/**
 * Admin-only PDF upload for MIRAI RAG (PRD §7.4 / US-SYS-02).
 *
 * Pipeline: multipart PDF → unpdf text extract → ~1000-token chunks →
 * insert into knowledge_base (Postgres generates the tsvector automatically).
 *
 * No external embedding API — search uses Postgres full-text search, which is
 * free, local, and unlimited. Earlier attempts with OpenAI/Gemini/Voyage all
 * hit free-tier rate limits.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';
import { withSentry } from '../_lib/sentry';

export const config = { runtime: 'edge' };

// Vercel serverless body limit on Hobby is ~4.5 MB. Pro is 50 MB.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const CHUNK_TOKENS = 1000;
const CHUNK_OVERLAP = 100;
// Rough heuristic: ~4 chars per token for Latin/Cyrillic mixed text.
const CHARS_PER_TOKEN = 4;

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const size = CHUNK_TOKENS * CHARS_PER_TOKEN;
  const overlap = CHUNK_OVERLAP * CHARS_PER_TOKEN;
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
    i += size - overlap;
  }
  return out;
}

async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'file field required');
    if (!file.name.toLowerCase().endsWith('.pdf')) throw new HttpError(400, 'PDF only');
    if (file.size > MAX_BYTES) {
      throw new HttpError(
        413,
        `Fayl çox böyükdür (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum: 4 MB. Daha kiçik PDF-ə bölün və ya sıxın.`,
      );
    }

    const buf = new Uint8Array(await file.arrayBuffer());

    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join('\n') : text;

    const chunks = chunkText(fullText);
    if (chunks.length === 0) {
      throw new HttpError(400, 'PDF mətn tapılmadı (skanlanmış ola bilər).');
    }

    const sb = admin();

    // Replace any existing rows for this PDF — admin re-upload = full refresh.
    await sb.from('knowledge_base').delete().eq('source_pdf', file.name);

    const rows = chunks.map((content, i) => ({
      source_pdf: file.name,
      chunk_index: i,
      content,
      uploaded_by: user.id,
    }));

    const { error } = await sb.from('knowledge_base').insert(rows);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, chunks: rows.length, source_pdf: file.name });
  } catch (e) {
    return errorResponse(e);
  }
}

export default withSentry(handler, 'knowledge-base/upload');
