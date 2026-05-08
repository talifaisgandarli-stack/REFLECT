/**
 * Bilik Bazası ingest — US-SYS-02.
 * Admin-only. Accepts { source_pdf, text }, chunks ~500 tokens with ~50 token
 * overlap (PRD AC), embeds each chunk, replaces any existing rows for the
 * same source_pdf (versioning per AC).
 *
 * Embedding provider: OpenAI text-embedding-3-small (1536-d). This deviates
 * from PRD §3.1's Anthropic-only stack — decision logged in the migration
 * series; PRD §3.1 should be amended to add the embedding model.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const CHARS_PER_CHUNK = 2000; // ~500 tokens at 4 chars/token
const CHARS_OVERLAP = 200;    // ~50 tokens
const MAX_CHARS = 1_000_000;  // 1MB raw text safety cap

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const body = (await req.json()) as { source_pdf?: string; text?: string };
    const sourcePdf = (body.source_pdf ?? '').trim();
    const text = (body.text ?? '').trim();
    if (!sourcePdf) throw new HttpError(400, 'source_pdf required');
    if (!text) throw new HttpError(400, 'text required');
    if (text.length > MAX_CHARS) {
      throw new HttpError(413, `Mətn ${MAX_CHARS} simvoldan böyük olmamalıdır.`);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new HttpError(500, 'OPENAI_API_KEY not configured');

    const chunks = chunk(text, CHARS_PER_CHUNK, CHARS_OVERLAP);
    if (chunks.length === 0) throw new HttpError(400, 'no chunks produced');

    const embeddings = await embedBatch(apiKey, chunks);

    const sb = admin();
    // Versioning per AC: replace existing rows for this source_pdf.
    const { error: delErr } = await sb
      .from('knowledge_base')
      .delete()
      .eq('source_pdf', sourcePdf);
    if (delErr) throw delErr;

    const rows = chunks.map((content, i) => ({
      source_pdf: sourcePdf,
      chunk_index: i,
      content,
      embedding: embeddings[i],
      uploaded_by: user.id,
    }));
    // Supabase JS will JSON-encode the embedding array; pgvector accepts that.
    const { error: insErr } = await sb.from('knowledge_base').insert(rows);
    if (insErr) throw insErr;

    return jsonResponse({ ok: true, source_pdf: sourcePdf, chunks: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}

function chunk(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const slice = text.slice(i, i + size);
    out.push(slice);
    if (i + size >= text.length) break;
    i += size - overlap;
  }
  return out;
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][]> {
  // OpenAI's embeddings endpoint accepts an array; cap batch size to be safe.
  const BATCH = 64;
  const results: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const slice = inputs.slice(i, i + BATCH);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: slice,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenAI embeddings ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    for (const row of json.data) results.push(row.embedding);
  }
  return results;
}
