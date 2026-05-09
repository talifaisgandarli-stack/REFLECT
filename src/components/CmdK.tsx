import { useEffect, useMemo, useState } from 'react';
import { useUI } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ProjectPreviewDrawer } from './ProjectPreviewDrawer';
import { TaskPreviewDrawer } from './TaskPreviewDrawer';
import { useT } from '@/lib/i18n';

const QUICK = [
  { label: 'Dashboard', to: '/' },
  { label: 'Tapşırıqlar', to: '/tapşırıqlar' },
  { label: 'Tamamlandı', to: '/tamamlandı' },
  { label: 'Layihələr', to: '/layihelər' },
  { label: 'Müştərilər', to: '/müştərilər' },
  { label: 'Maliyyə Mərkəzi', to: '/maliyyə' },
  { label: 'MIRAI', to: '/mirai' },
  { label: 'Telegram', to: '/telegram' },
  { label: 'Parametrlər', to: '/parametrlər' },
];

type Hit = {
  type: 'task' | 'project' | 'client' | 'announcement' | 'profile';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const TYPE_LABEL: Record<Hit['type'], string> = {
  task: 'Tapşırıq',
  project: 'Layihə',
  client: 'Müştəri',
  announcement: 'Elan',
  profile: 'Heyət',
};

export function CmdK() {
  const { cmdkOpen, setCmdK } = useUI();
  const [q, setQ] = useState('');
  const [serverHits, setServerHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const nav = useNavigate();
  const t = useT();

  useEffect(() => {
    if (!cmdkOpen) {
      setQ('');
      setServerHits([]);
      setCursor(0);
    }
  }, [cmdkOpen]);

  // Debounced server search; nav suggestions filter locally for instant feel.
  useEffect(() => {
    if (!cmdkOpen) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setServerHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setServerHits([]);
          return;
        }
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          headers: { authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setServerHits([]);
          return;
        }
        const data = (await res.json()) as { results: Hit[] };
        setServerHits(data.results ?? []);
      } catch {
        // aborted or network — keep previous list
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, cmdkOpen]);

  const navHits = useMemo(() => {
    const ql = q.toLowerCase().trim();
    if (!ql) return QUICK;
    return QUICK.filter((i) => i.label.toLowerCase().includes(ql));
  }, [q]);

  type ListItem =
    | { kind: 'nav'; label: string; to: string }
    | { kind: 'hit'; hit: Hit };

  const items: ListItem[] = useMemo(() => {
    const list: ListItem[] = [];
    for (const n of navHits) list.push({ kind: 'nav', label: n.label, to: n.to });
    for (const h of serverHits) list.push({ kind: 'hit', hit: h });
    return list;
  }, [navHits, serverHits]);

  function activate(item: ListItem) {
    // Project hits open the preview drawer instead of navigating away
    // immediately — feels closer to Linear/Slack quick-peek and avoids
    // a full route change for a glance.
    if (item.kind === 'hit' && item.hit.type === 'project') {
      setPreviewProjectId(item.hit.id);
      setCmdK(false);
      return;
    }
    if (item.kind === 'hit' && item.hit.type === 'task') {
      setPreviewTaskId(item.hit.id);
      setCmdK(false);
      return;
    }
    const to = item.kind === 'nav' ? item.to : item.hit.href;
    nav(to);
    setCmdK(false);
  }

  if (!cmdkOpen) {
    // Palette closed but a preview drawer may still be open
    if (previewProjectId)
      return (
        <ProjectPreviewDrawer
          projectId={previewProjectId}
          onClose={() => setPreviewProjectId(null)}
        />
      );
    if (previewTaskId)
      return (
        <TaskPreviewDrawer
          taskId={previewTaskId}
          onClose={() => setPreviewTaskId(null)}
        />
      );
    return null;
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
        className="w-full max-w-lg card p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 14 }}
      >
        <input
          autoFocus
          className="input border-0 rounded-none"
          placeholder={t('search.placeholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCmdK(false);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(items.length - 1, c + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === 'Enter' && items[cursor]) {
              e.preventDefault();
              activate(items[cursor]);
            }
          }}
        />
        <ul
          className="max-h-80 overflow-y-auto"
          style={{ borderTop: '1px solid var(--line-soft)' }}
        >
          {loading && q.trim().length >= 2 ? (
            <li
              className="px-4 py-2 text-meta"
              style={{ color: 'var(--text-muted)' }}
            >
              Axtarılır…
            </li>
          ) : null}
          {items.map((it, idx) => {
            const active = idx === cursor;
            const label = it.kind === 'nav' ? it.label : it.hit.title;
            const subtitle = it.kind === 'hit' ? it.hit.subtitle : undefined;
            const tag = it.kind === 'nav' ? 'Naviqasiya' : TYPE_LABEL[it.hit.type];
            return (
              <li key={`${it.kind}-${idx}`}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                  style={{ background: active ? 'var(--surface-mist)' : 'transparent' }}
                  onMouseEnter={() => setCursor(idx)}
                  onClick={() => activate(it)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-body truncate" style={{ color: 'var(--text)' }}>
                      {label}
                    </div>
                    {subtitle ? (
                      <div
                        className="text-meta truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {subtitle}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className="text-tiny shrink-0"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}
                  >
                    {tag.toUpperCase()}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length === 0 && !loading ? (
            <li
              className="px-4 py-6 text-meta text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('empty.no_results')}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
