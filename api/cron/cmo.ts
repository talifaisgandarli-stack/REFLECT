/**
 * MIRAI CMO weekly cron — REQ §7.8.
 * Pulls RSS items into mirai_feed_posts and drafts unapproved announcements.
 */
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const FEEDS = [
  'https://www.archdaily.com/feed',
  'https://www.dezeen.com/feed/',
];

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' || url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const sb = admin();
    let inserted = 0;
    for (const feed of FEEDS) {
      try {
        const xml = await fetch(feed).then((r) => r.text());
        const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/g)].slice(0, 5);
        for (const m of items) {
          const summary = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
          const link = m[2].trim();
          if (!link) continue;
          const { error } = await sb
            .from('mirai_feed_posts')
            .insert({ source_url: link, source_kind: 'trend', summary });
          if (!error) inserted++;
        }
      } catch {
        /* feed fetch errors are non-fatal */
      }
    }
    return jsonResponse({ ok: true, inserted });
  } catch (e) {
    return errorResponse(e);
  }
}
