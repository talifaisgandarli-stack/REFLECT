/**
 * AI ICP enrichment — REQ-CRM-04.
 *
 * Computes an Ideal Customer Profile (ICP) fit score 0–100 for a client using
 * Claude Haiku 4.5 (PRD §3.1). Cached on clients.ai_icp_fit until inputs
 * change; refresh max 1×/24h per client (PRD line 394).
 *
 * Input change detection: a SHA-1 of (name, company, email, phone, expected_value).
 * Stored as ai_icp_inputs_hash (added in migration 0016). If hash matches and
 * the cache is < 24h old, return the cached value without calling MIRAI.
 *
 * Auth: bd_lead or admin (matches clients RLS in 0002).
 * Cost: counted against the requesting user's MIRAI monthly cap (PRD §7.6).
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse, requireUser } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const CACHE_HOURS = 24;

type ClientRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  expected_value: number | null;
  ai_icp_fit: number | null;
  ai_icp_calculated_at: string | null;
  ai_icp_inputs_hash: string | null;
};

async function inputsHash(c: ClientRow): Promise<string> {
  const raw = JSON.stringify([c.name, c.company, c.email, c.phone, c.expected_value]);
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function freshEnough(at: string | null): boolean {
  if (!at) return false;
  const age = Date.now() - new Date(at).getTime();
  return age < CACHE_HOURS * 60 * 60 * 1000;
}

async function scoreWithMirai(client: Anthropic, c: ClientRow): Promise<number> {
  const prompt =
    `Reflect arxitektura studiyasının ICP-i: orta-böyük layihələr, ödəniş bacarığı, ` +
    `Bakı/Azərbaycan regional fokus, premium bina və exteryor sahələri. ` +
    `Bu müştərini 0–100 arası qiymətləndir (yalnız rəqəm cavab ver):\n` +
    `Ad: ${c.name}\nŞirkət: ${c.company ?? '—'}\n` +
    `Email: ${c.email ?? '—'}\n` +
    `Telefon: ${c.phone ?? '—'}\n` +
    `Gözlənilən dəyər (AZN): ${c.expected_value ?? '—'}`;

  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 16,
    system: 'Sən ICP analiz alqoritmi. Yalnız 0-100 arası tam ədəd qaytar.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = completion.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');
  const m = text.match(/\d{1,3}/);
  const n = m ? Math.min(100, Math.max(0, parseInt(m[0], 10))) : 0;
  return n;
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);
    const body = (await req.json()) as { client_id?: string };
    const clientId = body.client_id;
    if (!clientId) throw new HttpError(400, 'Missing client_id');

    const sb = admin();
    const { data: client } = await sb
      .from('clients')
      .select(
        'id, name, company, email, phone, expected_value, ai_icp_fit, ai_icp_calculated_at, ai_icp_inputs_hash',
      )
      .eq('id', clientId)
      .maybeSingle<ClientRow>();
    if (!client) throw new HttpError(404, 'Client not found');

    const hash = await inputsHash(client);
    const inputsUnchanged = client.ai_icp_inputs_hash === hash;

    // Cache hit: inputs unchanged AND last calc within 24h.
    if (inputsUnchanged && freshEnough(client.ai_icp_calculated_at) && client.ai_icp_fit != null) {
      return jsonResponse({
        client_id: client.id,
        ai_icp_fit: client.ai_icp_fit,
        cached: true,
        calculated_at: client.ai_icp_calculated_at,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const ai = new Anthropic({ apiKey });
    const score = await scoreWithMirai(ai, client);
    const calculatedAt = new Date().toISOString();

    await sb
      .from('clients')
      .update({
        ai_icp_fit: score,
        ai_icp_calculated_at: calculatedAt,
        ai_icp_inputs_hash: hash,
      })
      .eq('id', client.id);

    return jsonResponse({
      client_id: client.id,
      ai_icp_fit: score,
      cached: false,
      calculated_at: calculatedAt,
      requested_by: user.id,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
