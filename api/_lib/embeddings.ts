/**
 * OpenAI text-embedding-3-small wrapper — 1536-d to match the
 * knowledge_base.embedding column declared in PRD §3.2.
 *
 * Provider choice (OpenAI) is logged in the commit body of the introducing
 * PR. PRD §3.1 lists Anthropic for the LLM but is silent on embeddings;
 * this is the explicit deviation.
 */
import { HttpError } from './auth';

const EMBED_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small'; // 1536 dimensions

export async function embed(input: string | string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new HttpError(500, 'OPENAI_API_KEY not configured');

  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length === 0) return [];

  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(502, `Embedding API failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // Re-order by `index` to match input order.
  const out = new Array<number[]>(inputs.length);
  for (const row of json.data) out[row.index] = row.embedding;
  return out;
}

/**
 * Naive char-based chunker. ~1000 chars target, 150 overlap. Splits on
 * paragraph then sentence boundaries when possible.
 */
export function chunkText(text: string, target = 1000, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length === 0) return [];
  if (clean.length <= target) return [clean];

  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + target, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const breakAt = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('\n'),
      );
      if (breakAt > target * 0.5) end = i + breakAt + 1;
    }
    out.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return out.filter((s) => s.length > 0);
}
