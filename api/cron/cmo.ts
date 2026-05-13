/**
 * MIRAI CMO weekly cron — PRD §7.8.
 *
 * Fetches ArchDaily / Dezeen / Architizer / WAF RSS feeds, uses Claude Haiku to
 * summarize and filter for architecture + AZ/regional relevance, then inserts
 * mirai_feed_posts rows and corresponding unapproved announcements.
 */
import Anthropic from '@anthropic-ai/sdk';
import { admin, errorResponse, HttpError, jsonResponse } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001'; // PRD §3.1

const DEFAULT_FEEDS = [
  { url: 'https://www.archdaily.com/feed', kind: 'trend' as const },
  { url: 'https://www.dezeen.com/feed/', kind: 'trend' as const },
  { url: 'https://www.architizer.com/feed/', kind: 'opportunity' as const },
  { url: 'https://worldarchitecturefestival.com/feed/', kind: 'opportunity' as const },
];

type FeedConfig = { url: string; kind: 'trend' | 'opportunity' };

async function resolveFeeds(sb: ReturnType<typeof admin>): Promise<FeedConfig[]> {
  const { data } = await sb
    .from('system_settings')
    .select('value')
    .eq('key', 'mirai_rss_feeds')
    .maybeSingle();
  if (!data?.value) return DEFAULT_FEEDS;
  try {
    const custom = JSON.parse(String(data.value)) as FeedConfig[];
    if (!Array.isArray(custom) || custom.length === 0) return DEFAULT_FEEDS;
    // Merge: custom overrides defaults by URL, extras appended
    const byUrl = new Map<string, FeedConfig>(DEFAULT_FEEDS.map((f) => [f.url, f]));
    for (const c of custom) {
      if (c?.url) byUrl.set(c.url, { url: c.url, kind: c.kind ?? 'trend' });
    }
    return Array.from(byUrl.values());
  } catch {
    return DEFAULT_FEEDS;
  }
}

type FeedItem = { title: string; link: string; description: string };

function parseRssItems(xml: string, max = 5): FeedItem[] {
  const items: FeedItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks.slice(0, max)) {
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) ?? [])[1] ?? '';
    const desc = (block.match(/<description>([\s\S]*?)<\/description>/) ?? [])[1] ?? '';
    const clean = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
    if (link.trim()) {
      items.push({ title: clean(title), link: link.trim(), description: clean(desc).slice(0, 400) });
    }
  }
  return items;
}

async function summariseWithMirai(item: FeedItem, apiKey: string): Promise<string | null> {
  const client = new Anthropic({ apiKey });
  const prompt = `Sən Reflect arxitektura studiyasının CMO köməkçisisen.
Aşağıdakı məqalənin 1-2 cümlə xülasəsini AZ dilində yaz. Əgər məqalə arxitektura, dizayn, Azərbaycan/regional kontekstə aid deyilsə, yalnız "SKIP" cavabı ver.

Başlıq: ${item.title}
Məzmun: ${item.description}`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
    if (!text || text.startsWith('SKIP')) return null;
    return text;
  } catch {
    return item.title || null;
  }
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const cronAuth =
      req.headers.get('x-vercel-cron') === '1' || url.searchParams.get('key') === process.env.CRON_SECRET;
    if (!cronAuth) throw new HttpError(401, 'Cron auth required');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');

    const sb = admin();
    let inserted = 0;
    let skipped = 0;

    const feeds = await resolveFeeds(sb);
    for (const feed of feeds) {
      let xml: string;
      try {
        xml = await fetch(feed.url, { signal: AbortSignal.timeout(8_000) }).then((r) => r.text());
      } catch {
        continue; // non-fatal: skip unreachable feed
      }

      const items = parseRssItems(xml, 5);
      for (const item of items) {
        // Idempotency: skip if we already have this URL
        const { data: existing } = await sb
          .from('mirai_feed_posts')
          .select('id')
          .eq('source_url', item.link)
          .maybeSingle();
        if (existing) {
          skipped++;
          continue;
        }

        const summary = await summariseWithMirai(item, apiKey);
        if (!summary) {
          skipped++;
          continue; // MIRAI filtered it as irrelevant
        }

        // Insert feed post row
        const { data: feedRow, error: feedErr } = await sb
          .from('mirai_feed_posts')
          .insert({ source_url: item.link, source_kind: feed.kind, summary })
          .select('id')
          .single();
        if (feedErr || !feedRow) continue;

        // Create unapproved announcement (PRD §7.8)
        const { data: ann } = await sb
          .from('announcements')
          .insert({
            title: item.title.slice(0, 200) || summary.slice(0, 100),
            body: `${summary}\n\nMənbə: ${item.link}`,
            category: feed.kind === 'opportunity' ? 'Opportunity (MIRAI)' : 'Trend (MIRAI)',
            mirai_generated: true,
            approved: false,
          })
          .select('id')
          .single();

        // Link announcement back to feed post
        if (ann) {
          await sb
            .from('mirai_feed_posts')
            .update({ posted_announcement_id: ann.id })
            .eq('id', feedRow.id);
        }

        inserted++;
      }
    }

    return jsonResponse({ ok: true, inserted, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
