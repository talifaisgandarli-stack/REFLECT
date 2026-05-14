/**
 * Cmd+K universal search (PRD §6.2).
 *
 * Searches tasks, projects, clients, announcements, team members. Returns top
 * results grouped by entity type. RLS is enforced via user-scoped Supabase
 * client (userClient) — searches never leak rows the user can't read.
 *
 * URL: GET /api/search?q=...
 */
import { errorResponse, HttpError, jsonResponse, requireUser, userClient } from './_lib/auth';
import { checkRateLimit } from './_lib/rate-limit';

export const config = { runtime: 'edge' };

const PER_GROUP = 5;

type Hit = {
  type: 'task' | 'project' | 'client' | 'announcement' | 'profile';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

function escapeIlike(q: string): string {
  // Escape PostgreSQL ILIKE wildcards and ? operator characters.
  return q.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req);

    const rateLimitErr = await checkRateLimit(req, user);
    if (rateLimitErr) return rateLimitErr;

    const url = new URL(req.url);
    const raw = (url.searchParams.get('q') ?? '').trim();
    if (raw.length < 2) {
      return jsonResponse({ q: raw, results: [] });
    }
    const q = `%${escapeIlike(raw)}%`;
    const sb = userClient(user.token);

    const [tasks, projects, clients, announcements, profiles] = await Promise.all([
      sb
        .from('tasks')
        .select('id, title, status, project_id, deadline')
        .ilike('title', q)
        .is('archived_at', null)
        .limit(PER_GROUP),
      sb
        .from('projects')
        .select('id, name, status, deadline')
        .ilike('name', q)
        .is('archived_at', null)
        .limit(PER_GROUP),
      user.isAdmin
        ? sb
            .from('clients')
            .select('id, name, company, pipeline_stage')
            .or(`name.ilike.${q},company.ilike.${q}`)
            .limit(PER_GROUP)
        : Promise.resolve({ data: [], error: null }),
      sb
        .from('announcements')
        .select('id, title, category, published_at')
        .ilike('title', q)
        .eq('approved', true)
        .limit(PER_GROUP),
      sb
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.${q},email.ilike.${q}`)
        .limit(PER_GROUP),
    ]);

    const results: Hit[] = [];
    for (const t of (tasks.data ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      project_id: string | null;
      deadline: string | null;
    }>) {
      results.push({
        type: 'task',
        id: t.id,
        title: t.title,
        subtitle: [t.status, t.deadline ?? null].filter(Boolean).join(' · '),
        href: '/tapşırıqlar',
      });
    }
    for (const p of (projects.data ?? []) as Array<{
      id: string;
      name: string;
      status: string;
      deadline: string | null;
    }>) {
      results.push({
        type: 'project',
        id: p.id,
        title: p.name,
        subtitle: [p.status, p.deadline ?? null].filter(Boolean).join(' · '),
        href: `/layihelər/${p.id}`,
      });
    }
    for (const c of (clients.data ?? []) as Array<{
      id: string;
      name: string;
      company: string | null;
      pipeline_stage: string;
    }>) {
      results.push({
        type: 'client',
        id: c.id,
        title: c.name,
        subtitle: [c.company ?? null, c.pipeline_stage].filter(Boolean).join(' · '),
        href: '/müştərilər',
      });
    }
    for (const a of (announcements.data ?? []) as Array<{
      id: string;
      title: string;
      category: string | null;
    }>) {
      results.push({
        type: 'announcement',
        id: a.id,
        title: a.title,
        subtitle: a.category ?? undefined,
        href: '/komanda/elanlar',
      });
    }
    for (const u of (profiles.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string;
    }>) {
      results.push({
        type: 'profile',
        id: u.id,
        title: u.full_name || u.email,
        subtitle: u.full_name ? u.email : undefined,
        href: '/komanda/heyət',
      });
    }

    return jsonResponse({ q: raw, results });
  } catch (e) {
    return errorResponse(e);
  }
}
