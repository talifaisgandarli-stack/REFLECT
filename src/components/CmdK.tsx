/**
 * Universal Cmd+K palette — PRD §6.2.
 *
 * Two result tiers:
 *   1. Static "Tezyetə" nav targets (always shown when query matches).
 *   2. Entity results from /api/search?q= grouped by table (PRD §6.2:
 *      tasks, projects, clients, documents, announcements, profiles).
 *
 * Keyboard contract:
 *   - Up / Down — move highlight across the flattened result list
 *   - Enter     — open the highlighted target
 *   - Escape    — close the palette
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type ServerHit = { id: string; title: string; subtitle?: string | null; href: string };
type ServerGroup = { group: string; items: ServerHit[] };
type FlatItem = { group: string; title: string; subtitle?: string | null; href: string; key: string };

const NAV_GROUP = 'Tezyetə';
const QUICK: FlatItem[] = [
  { group: NAV_GROUP, title: 'Dashboard',       href: '/',             key: 'nav:/' },
  { group: NAV_GROUP, title: 'Tapşırıqlar',     href: '/tapşırıqlar',  key: 'nav:tasks' },
  { group: NAV_GROUP, title: 'Layihələr',       href: '/layihelər',    key: 'nav:projects' },
  { group: NAV_GROUP, title: 'Müştərilər',      href: '/müştərilər',   key: 'nav:clients' },
  { group: NAV_GROUP, title: 'Maliyyə Mərkəzi', href: '/maliyyə',      key: 'nav:finance' },
  { group: NAV_GROUP, title: 'MIRAI',           href: '/mirai',        key: 'nav:mirai' },
  { group: NAV_GROUP, title: 'Telegram',        href: '/telegram',     key: 'nav:telegram' },
  { group: NAV_GROUP, title: 'Parametrlər',     href: '/parametrlər',  key: 'nav:settings' },
];

export function CmdK() {
  const { cmdkOpen, setCmdK } = useUI();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [hl, setHl] = useState(0);
  const nav = useNavigate();
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!cmdkOpen) {
      setQ('');
      setGroups([]);
      setHl(0);
    }
  }, [cmdkOpen]);

  // Server search — debounced. Skip when q is too short; PRD §6.2 doesn't
  // mandate a minimum, but ≥2 chars avoids returning the entire DB.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setGroups([]);
      return;
    }
    const id = ++reqIdRef.current;
    const t = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { results: ServerGroup[] };
        if (id === reqIdRef.current) setGroups(json.results ?? []);
      } catch {
        /* swallow — palette stays usable on transient failures */
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [q]);

  const navMatches = useMemo(
    () => QUICK.filter((i) => i.title.toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  const flat = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    if (q.trim().length === 0) return QUICK;
    if (navMatches.length > 0) out.push(...navMatches);
    for (const g of groups) {
      for (const it of g.items) {
        out.push({
          group: g.group,
          title: it.title,
          subtitle: it.subtitle ?? null,
          href: it.href,
          key: `${g.group}:${it.id}`,
        });
      }
    }
    return out;
  }, [q, navMatches, groups]);

  // Re-clamp the highlight whenever results change.
  useEffect(() => {
    if (hl >= flat.length) setHl(0);
  }, [flat.length, hl]);

  if (!cmdkOpen) return null;

  function open(item: FlatItem) {
    nav(item.href);
    setCmdK(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={() => setCmdK(false)}
    >
      <div
        className="w-full max-w-xl card p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 14 }}
      >
        <input
          autoFocus
          className="input border-0 rounded-none"
          placeholder="Axtar… (Cmd+K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCmdK(false);
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHl((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHl((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter' && flat[hl]) {
              open(flat[hl]);
            }
          }}
        />
        <ul
          className="max-h-[60vh] overflow-y-auto"
          style={{ borderTop: '1px solid var(--line-soft)' }}
        >
          {flat.length === 0 ? (
            <li className="px-4 py-6 text-meta text-center" style={{ color: 'var(--text-muted)' }}>
              {q.trim().length < 2 ? 'Yazmağa başla…' : 'Heç nə tapılmadı'}
            </li>
          ) : (
            renderGrouped(flat, hl, open)
          )}
        </ul>
      </div>
    </div>
  );
}

function renderGrouped(flat: FlatItem[], hl: number, open: (i: FlatItem) => void) {
  const out: React.ReactNode[] = [];
  let lastGroup = '';
  flat.forEach((item, idx) => {
    if (item.group !== lastGroup) {
      out.push(
        <li
          key={`g:${item.group}:${idx}`}
          className="px-4 pt-3 pb-1 text-meta"
          style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {item.group}
        </li>,
      );
      lastGroup = item.group;
    }
    const active = idx === hl;
    out.push(
      <li key={item.key}>
        <button
          type="button"
          className="w-full text-left px-4 py-2 text-body flex items-baseline justify-between gap-3"
          style={{
            background: active ? 'rgba(173,251,73,0.08)' : 'transparent',
          }}
          onMouseEnter={() => {
            // Keep mouse + keyboard in sync.
            if (!active) (document.activeElement as HTMLElement | null)?.focus();
          }}
          onClick={() => open(item)}
        >
          <span className="truncate">{item.title}</span>
          {item.subtitle ? (
            <span className="text-meta shrink-0" style={{ color: 'var(--text-muted)' }}>
              {item.subtitle}
            </span>
          ) : null}
        </button>
      </li>,
    );
  });
  return out;
}
