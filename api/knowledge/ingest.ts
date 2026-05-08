/**
 * Knowledge base ingestion (PRD §10.3 / §7.4 RAG).
 *
 * Accepts a JSON body with { source_pdf, chunks: string[] } — admin posts
 * a pre-extracted chunk array (PDF parsing happens client-side or in a
 * separate worker; keeping this endpoint simple makes it usable from a
 * shell or curl too). Each chunk is embedded via Anthropic's voyage-3
 * is too provider-locked, so we use a lightweight deterministic hash
 * embedding placeholder when ANTHROPIC_API_KEY is unavailable — the
 * pgvector schema accepts any 1536-dim float vector and the search query
 * uses cosine distance, so swapping in a real provider later is a 1-line
 * change.
 */
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const EMBED_DIM = 1536;
const MAX_CHUNKS_PER_REQUEST = 200;
const MAX_CHUNK_LEN = 4_000;

/**
 * Deterministic placeholder embedding. Uses fnv-1a hash of overlapping
 * 4-grams to populate the 1536-dim vector. NOT semantic — search will
 * surface exact-substring matches only. Replace with a real embedder
 * (Voyage / OpenAI / Cohere) when the provider decision lands.
 */
function placeholderEmbed(text: string): number[] {
  const v = new Float32Array(EMBED_DIM);
  const lower = text.toLowerCase().normalize('NFKD');
  for (let i = 0; i + 4 <= lower.length; i++) {
    const gram = lower.slice(i, i + 4);
    let h = 2166136261;
    for (let j = 0; j < gram.length; j++) {
      h ^= gram.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    v[idx] += 1;
  }
  // L2 normalise so cosine ≈ dot
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    if (!user.isAdmin) throw new HttpError(403, 'Admin only');

    const body = (await req.json()) as { source_pdf?: string; chunks?: string[] };
    const source = (body.source_pdf ?? '').trim();
    const chunks = Array.isArray(body.chunks) ? body.chunks : [];

    if (!source) throw new HttpError(400, 'source_pdf required');
    if (chunks.length === 0) throw new HttpError(400, 'chunks[] cannot be empty');
    if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
      throw new HttpError(400, `too many chunks (>${MAX_CHUNKS_PER_REQUEST}); split into batches`);
    }

    const sb = admin();
    const rows = chunks.map((raw, i) => {
      const trimmed = raw.toString().slice(0, MAX_CHUNK_LEN);
      return {
        source_pdf: source,
        chunk_index: i,
        content: trimmed,
        embedding: placeholderEmbed(trimmed),
        uploaded_by: user.id,
      };
    });

    // Replace strategy: delete prior chunks for this source, then insert fresh
    await sb.from('knowledge_base').delete().eq('source_pdf', source);
    const { error } = await sb.from('knowledge_base').insert(rows);
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ ok: true, source_pdf: source, inserted: rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
