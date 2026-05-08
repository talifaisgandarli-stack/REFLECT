/**
 * Universal search — PRD §6.2.
 * Searches tasks, projects, clients, documents, announcements, team members.
 * Returns top 8 per group. RLS is enforced by querying with the caller's JWT.
 */
import { errorResponse, jsonResponse, requireUser, userClient } from './_lib/auth';

export const config = { runtime: 'edge' };

export type SearchHit = {
  group: 'tasks' | 'projects' | 'clients' | 'documents' | 'announcements' | 'team';
  id: string;
  label: string;
  sublabel?: string | null;
  href: string;
};

const LIMIT = 8;

export default async function handler(req: Request) {
  try {
    await requireUser(req);
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2) return jsonResponse({ q, hits: [] satisfies SearchHit[] });

    const sb = userClient(req);
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

    const [tasks, projects, clients, docs, ann, team] = await Promise.all([
      sb.from('tasks').select('id, title, status').ilike('title', like).is('archived_at', null).limit(LIMIT),
      sb.from('projects').select('id, name, status').ilike('name', like).is('archived_at', null).limit(LIMIT),
      sb.from('clients').select('id, name, company').ilike('name', like).limit(LIMIT),
      sb.from('project_documents').select('id, title, category').ilike('title', like).limit(LIMIT),
      sb.from('announcements').select('id, title, category').ilike('title', like).limit(LIMIT),
      sb.from('profiles').select('id, full_name, email').ilike('full_name', like).eq('is_active', true).limit(LIMIT),
    ]);

    const hits: SearchHit[] = [
      ...(tasks.data ?? []).map((r) => ({
        group: 'tasks' as const,
        id: r.id,
        label: r.title,
        sublabel: r.status,
        href: `/tapşırıqlar?id=${r.id}`,
      })),
      ...(projects.data ?? []).map((r) => ({
        group: 'projects' as const,
        id: r.id,
        label: r.name,
        sublabel: r.status,
        href: `/layihelər/${r.id}`,
      })),
      ...(clients.data ?? []).map((r) => ({
        group: 'clients' as const,
        id: r.id,
        label: r.name,
        sublabel: r.company,
        href: `/müştərilər?id=${r.id}`,
      })),
      ...(docs.data ?? []).map((r) => ({
        group: 'documents' as const,
        id: r.id,
        label: r.title,
        sublabel: r.category,
        href: `/sənədlər/${r.id}`,
      })),
      ...(ann.data ?? []).map((r) => ({
        group: 'announcements' as const,
        id: r.id,
        label: r.title,
        sublabel: r.category,
        href: `/elanlar/${r.id}`,
      })),
      ...(team.data ?? []).map((r) => ({
        group: 'team' as const,
        id: r.id,
        label: r.full_name ?? r.email,
        sublabel: r.email,
        href: `/komanda/işçilər?id=${r.id}`,
      })),
    ];

    return jsonResponse({ q, hits });
  } catch (e) {
    return errorResponse(e);
  }
}
