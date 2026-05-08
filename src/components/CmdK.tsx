import { useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type SearchHit = {
  group: 'tasks' | 'projects' | 'clients' | 'documents' | 'announcements' | 'team';
  id: string;
  label: string;
  sublabel?: string | null;
  href: string;
};

const GROUP_LABEL: Record<SearchHit['group'], string> = {
  tasks: 'Tapşırıqlar',
  projects: 'Layihələr',
  clients: 'Müştərilər',
  documents: 'Sənədlər',
  announcements: 'Elanlar',
  team: 'Komanda',
};

const QUICK: SearchHit[] = [
  { group: 'projects', id: 'nav-dashboard', label: 'Dashboard', href: '/' },
  { group: 'projects', id: 'nav-tasks', label: 'Tapşırıqlar', href: '/tapşırıqlar' },
  { group: 'projects', id: 'nav-projects', label: 'Layihələr', href: '/layihelər' },
  { group: 'projects', id: 'nav-clients', label: 'Müştərilər', href: '/müştərilər' },
  { group: 'projects', id: 'nav-finance', label: 'Maliyyə Mərkəzi', href: '/maliyyə' },
  { group: 'projects', id: 'nav-mirai', label: 'MIRAI', href: '/mirai' },
];

export function CmdK() {
  const { cmdkOpen, setCmdK } = useUI();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!cmdkOpen) {
      setQ('');
      setHits([]);
      setActive(0);
    }
  }, [cmdkOpen]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myReq = ++reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (myReq !== reqIdRef.current) return;
        const json = (await res.json()) as { hits: SearchHit[] };
        setHits(json.hits ?? []);
        setActive(0);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const list: SearchHit[] = useMemo(() => {
    if (q.trim().length < 2) {
      return QUICK.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
    }
    return hits;
  }, [q, hits]);

  const grouped = useMemo(() => {
    const m = new Map<SearchHit['group'], SearchHit[]>();
    for (const h of list) {
      const arr = m.get(h.group) ?? [];
      arr.push(h);
      m.set(h.group, arr);
    }
    return [...m.entries()];
  }, [list]);

  if (!cmdkOpen) return null;

  function go(hit: SearchHit) {
    nav(hit.href);
    setCmdK(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setCmdK(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && list[active]) {
      e.preventDefault();
      go(list[active]);
    }
  }

  let runningIndex = 0;
  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={() => setCmdK(false)}
    >
      <div
        className="w-full max-w-lg card p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 14 }}
      >
        <input
          autoFocus
          className="input border-0 rounded-none"
          placeholder="Axtar… (Cmd+K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Axtarış"
        />
        <ul
          className="max-h-96 overflow-y-auto"
          style={{ borderTop: '1px solid var(--line-soft)' }}
          role="listbox"
        >
          {loading ? (
            <li className="px-4 py-3 text-meta" style={{ color: 'var(--text-muted)' }}>
              Axtarılır…
            </li>
          ) : list.length === 0 ? (
            <li
              className="px-4 py-6 text-meta text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              {q.trim().length < 2 ? 'Yazmağa başla…' : 'Heç nə tapılmadı'}
            </li>
          ) : (
            grouped.map(([group, items]) => (
              <li key={group}>
                <div
                  className="px-4 py-2 text-tiny uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface-mist)' }}
                >
                  {GROUP_LABEL[group]}
                </div>
                <ul>
                  {items.map((hit) => {
                    const idx = runningIndex++;
                    const isActive = idx === active;
                    return (
                      <li key={`${hit.group}-${hit.id}`} role="option" aria-selected={isActive}>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-3 text-body"
                          style={{
                            background: isActive ? 'var(--surface-mist)' : 'transparent',
                          }}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(hit)}
                        >
                          <div className="truncate">{hit.label}</div>
                          {hit.sublabel ? (
                            <div
                              className="text-meta truncate"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {hit.sublabel}
                            </div>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
