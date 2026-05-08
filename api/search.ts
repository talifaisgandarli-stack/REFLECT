/**
 * Universal Cmd+K search — PRD §6.2.
 *
 *   "Server endpoint /api/search?q=... searches across: tasks, projects,
 *    clients, documents, announcements, team members. Returns top 8 grouped."
 *
 * Strategy:
 *   - Single edge route, parallel queries via the user's Supabase client so
 *     RLS does access control. We DON'T use the service role here — letting
 *     RLS hide rows the caller can't see is the whole point. Each table has
 *     its own SELECT policy from migration 0002.
 *   - One ilike filter per table, scoped to the most relevant text columns.
 *     The query is escaped to prevent PostgREST `or(...)` injection (`,` and
 *     `*` are PostgREST operator separators inside or-strings).
 *   - Top 8 each (PRD says "top 8 grouped"). Tightly bounded.
 *
 * Auth: standard requireUser bearer flow. Tokens parsed by Supabase, RLS
 * applied for the caller.
 */
import { createClient } from '@supabase/supabase-js';
import { errorResponse, HttpError, jsonResponse } from './_lib/auth';

export const config = { runtime: 'edge' };

const PER_GROUP = 8;

type Hit = { id: string; title: string; subtitle?: string | null; href: string };
type Result = { group: string; items: Hit[] };

/** PostgREST `or` operator splits on commas and quotes patterns with `*`,
 *  so user input must be sanitized before being interpolated. We strip
 *  the dangerous chars rather than try to escape them — Cmd+K queries
 *  are short tokens, not regexes. */
function sanitize(q: string): string {
  return q.replace(/[,*()]/g, '').trim().slice(0, 64);
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const url = new URL(req.url);
    const raw = url.searchParams.get('q') ?? '';
    const q = sanitize(raw);
    if (q.length < 2) return jsonResponse({ q: raw, results: [] });

    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token');
    const token = auth.slice(7);

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
    if (!supabaseUrl || !anonKey) throw new HttpError(500, 'Supabase env missing');

    // User-scoped client: RLS applies. We pass the bearer through the
    // global headers so PostgREST sees auth.uid() = the caller.
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const pat = `%${q}%`;

    const [
      tasks,
      projects,
      clients,
      documents,
      announcements,
      profiles,
    ] = await Promise.all([
      sb
        .from('tasks')
        .select('id, title, status, project_id, archived_at')
        .ilike('title', pat)
        .is('archived_at', null)
        .limit(PER_GROUP),
      sb
        .from('projects')
        .select('id, name, status, client_id')
        .ilike('name', pat)
        .is('archived_at', null)
        .limit(PER_GROUP),
      sb
        .from('clients')
        .select('id, name, company, pipeline_stage')
        .or(`name.ilike.${pat},company.ilike.${pat}`)
        .limit(PER_GROUP),
      sb
        .from('project_documents')
        .select('id, title, category, project_id')
        .ilike('title', pat)
        .limit(PER_GROUP),
      sb
        .from('announcements')
        .select('id, title, category, approved')
        .ilike('title', pat)
        .eq('approved', true)
        .limit(PER_GROUP),
      sb
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.${pat},email.ilike.${pat}`)
        .limit(PER_GROUP),
    ]);

    const results: Result[] = [];

    if (tasks.data?.length) {
      results.push({
        group: 'Tapşırıqlar',
        items: tasks.data.map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: t.status ?? null,
          href: `/tapşırıqlar?id=${t.id}`,
        })),
      });
    }
    if (projects.data?.length) {
      results.push({
        group: 'Layihələr',
        items: projects.data.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.status ?? null,
          href: `/layihelər/${p.id}`,
        })),
      });
    }
    if (clients.data?.length) {
      results.push({
        group: 'Müştərilər',
        items: clients.data.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: c.company ?? c.pipeline_stage ?? null,
          href: `/müştərilər?id=${c.id}`,
        })),
      });
    }
    if (documents.data?.length) {
      results.push({
        group: 'Sənədlər',
        items: documents.data.map((d) => ({
          id: d.id,
          title: d.title,
          subtitle: d.category ?? null,
          href: d.project_id ? `/layihelər/${d.project_id}` : `/`,
        })),
      });
    }
    if (announcements.data?.length) {
      results.push({
        group: 'Elanlar',
        items: announcements.data.map((a) => ({
          id: a.id,
          title: a.title,
          subtitle: a.category ?? null,
          href: '/komanda/elanlar',
        })),
      });
    }
    if (profiles.data?.length) {
      results.push({
        group: 'Komanda',
        items: profiles.data.map((p) => ({
          id: p.id,
          title: p.full_name ?? p.email ?? '—',
          subtitle: p.full_name ? p.email : null,
          href: '/komanda/heyət',
        })),
      });
    }

    return jsonResponse({ q: raw, results });
  } catch (e) {
    return errorResponse(e);
  }
}
