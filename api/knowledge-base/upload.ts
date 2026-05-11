/**
 * Admin-only PDF upload for MIRAI RAG (PRD §7.4 / US-SYS-02).
 *
 * Pipeline: multipart PDF → unpdf text extract → ~500-token chunks →
 * OpenAI text-embedding-ada-002 → insert into knowledge_base.
 *
 * RLS already restricts knowledge_base writes to admins (kb_admin_write),
 * but we double-check `user.isAdmin` to short-circuit before parsing.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'nodejs' };

// Vercel serverless body limit on the Hobby plan is ~4.5 MB. Pro plan is 50 MB.
// Stay safely below the platform cap so users get our error message, not Vercel's.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const CHUNK_TOKENS = 500;
const CHUNK_OVERLAP = 50;
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

// Google Gemini text-embedding-004 — free tier: 1500 requests/day, no card.
// 768-dim multilingual vectors (good Azerbaijani support).
// Get key: https://aistudio.google.com/apikey
async function embed(input: string, key: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: input }] },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new HttpError(502, `Embedding failed (${res.status}): ${errBody.slice(0, 200)}`);
  }
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const v = data.embedding?.values;
  if (!v || v.length === 0) throw new HttpError(502, 'Embedding missing');
  return v;
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new HttpError(
        503,
        'Embedding xidməti açılmayıb. GOOGLE_API_KEY Vercel-də təyin edilməlidir (pulsuz açar: aistudio.google.com/apikey).',
      );
    }

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

    // unpdf is edge/node compatible and has no native deps.
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join('\n') : text;

    const chunks = chunkText(fullText);
    if (chunks.length === 0) throw new HttpError(400, 'PDF mətn tapılmadı (skanlanmış ola bilər)');

    const sb = admin();

    // Replace any existing rows for this PDF — admin re-upload = full refresh.
    await sb.from('knowledge_base').delete().eq('source_pdf', file.name);

    const rows: Array<{
      source_pdf: string;
      chunk_index: number;
      content: string;
      embedding: number[];
      uploaded_by: string;
    }> = [];

    // Sequential to keep token-rate predictable; small PDFs typically <50 chunks.
    for (let i = 0; i < chunks.length; i++) {
      const vec = await embed(chunks[i], apiKey);
      rows.push({
        source_pdf: file.name,
        chunk_index: i,
        content: chunks[i],
        embedding: vec,
        uploaded_by: user.id,
      });
    }

    const { error } = await sb.from('knowledge_base').insert(rows);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, chunks: rows.length, source_pdf: file.name });
  } catch (e) {
    return errorResponse(e);
  }
}
